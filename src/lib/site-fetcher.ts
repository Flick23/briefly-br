import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

import type { SiteStatus } from "@/lib/schemas";

/**
 * Busca e limpa o texto do site do prospect, com proteção contra SSRF:
 * - só http/https;
 * - o IP é checado no `lookup` da própria conexão (cobre DNS rebinding) e
 *   também quando o host já é um IP literal;
 * - cada redirect passa pelas mesmas checagens.
 * Falhas nunca derrubam o brief: o resultado volta com `status: "failed"`.
 */

export const SITE_DEFAULTS = {
  timeoutMs: 8_000,
  maxBytes: 1_000_000,
  maxRedirects: 3,
  maxChars: 15_000,
  aboutMaxChars: 5_000,
} as const;

// Listas separadas: o BlockList do Node aplica regras IPv6 de IPv4-mapeado
// (::ffff:0:0/96) também a endereços IPv4, o que bloquearia todo IPv4.
const blockedV4 = new net.BlockList();
const blockedV6 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "esta" rede
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local / metadados de nuvem
  ["172.16.0.0", 12], // privada
  ["192.0.0.0", 24], // IETF
  ["192.0.2.0", 24], // documentação
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // documentação
  ["203.0.113.0", 24], // documentação
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada + broadcast
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], // não especificado
  ["::1", 128], // loopback
  ["::", 96], // IPv4-compatível (obsoleto)
  ["::ffff:0:0", 96], // IPv4-mapeado
  ["64:ff9b::", 96], // NAT64
  ["2001:db8::", 32], // documentação
  ["fc00::", 7], // ULA (privada)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

/** `true` se o IP for loopback, privado, link-local ou reservado. Entrada que não é IP é bloqueada. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const family = net.isIP(ip);
  if (family === 4) return blockedV4.check(ip, "ipv4");
  if (family === 6) return blockedV6.check(ip, "ipv6");
  return true;
}

export type SiteFailureReason =
  | "invalid_url"
  | "blocked_host"
  | "timeout"
  | "too_large"
  | "http_status"
  | "unsupported_content"
  | "too_many_redirects"
  | "network";

export class SiteFetchError extends Error {
  constructor(
    readonly reason: SiteFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export interface SitePage {
  url: string;
  text: string;
}

export interface SiteContent {
  status: SiteStatus;
  pages: SitePage[];
  failureReason?: SiteFailureReason;
}

type LookupAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

export interface SiteFetcherOptions {
  lookup?: LookupFn;
  isBlocked?: (address: string) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxChars?: number;
}

const defaultLookup: LookupFn = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

const USER_AGENT = "BrieflyBot/0.1 (+https://github.com/Flick23/briefly-br)";

interface RawPage {
  url: string;
  html: string;
}

/** Faz um GET com checagem de IP na conexão, limite de bytes e timeout. Segue até N redirects. */
async function fetchHtml(startUrl: string, opts: Required<Omit<SiteFetcherOptions, "maxChars">>): Promise<RawPage> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let current = startUrl;

  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const url = parseHttpUrl(current);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      throw new SiteFetchError("blocked_host", `Host bloqueado: ${hostname}`);
    }
    // Com IP literal o Node não chama `lookup`, então a checagem é feita aqui.
    if (net.isIP(hostname) && opts.isBlocked(hostname)) {
      throw new SiteFetchError("blocked_host", `IP bloqueado: ${hostname}`);
    }

    const response = await request(url, signal, opts);
    const status = response.statusCode ?? 0;

    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      current = new URL(response.headers.location, url).toString();
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new SiteFetchError("http_status", `HTTP ${status} em ${url}`);
    }

    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType)) {
      response.resume();
      throw new SiteFetchError("unsupported_content", `Content-Type não suportado: ${contentType}`);
    }

    const body = await readBody(response, opts.maxBytes);
    return { url: url.toString(), html: decode(body, contentType) };
  }

  throw new SiteFetchError("too_many_redirects", `Mais de ${opts.maxRedirects} redirects a partir de ${startUrl}`);
}

function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SiteFetchError("invalid_url", `URL inválida: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SiteFetchError("invalid_url", `Protocolo não permitido: ${url.protocol}`);
  }
  return url;
}

function request(
  url: URL,
  signal: AbortSignal,
  opts: Required<Omit<SiteFetcherOptions, "maxChars">>,
): Promise<http.IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;

  // Assinatura de `lookup` do `net`: valida todos os IPs resolvidos antes de conectar.
  const lookup: net.LookupFunction = (hostname, options, callback) => {
    opts
      .lookup(hostname)
      .then((addresses) => {
        if (!addresses.length) throw new SiteFetchError("network", `DNS sem resposta para ${hostname}`);
        const blocked = addresses.find((entry) => opts.isBlocked(entry.address));
        if (blocked) throw new SiteFetchError("blocked_host", `${hostname} resolve para IP bloqueado (${blocked.address})`);
        if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0].address, addresses[0].family);
        }
      })
      .catch((err: Error) => callback(err as NodeJS.ErrnoException, "", 0));
  };

  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: "GET",
      signal,
      lookup,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8,es;q=0.7",
      },
    });
    req.on("response", resolve);
    req.on("error", (err) => reject(normalizeError(err, signal)));
    req.end();
  });
}

function readBody(response: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  let stream: Readable = response;
  const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") stream = response.pipe(zlib.createGunzip());
  else if (encoding === "deflate") stream = response.pipe(zlib.createInflate());
  else if (encoding === "br") stream = response.pipe(zlib.createBrotliDecompress());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        stream.destroy();
        reject(new SiteFetchError("too_large", `Resposta acima de ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(normalizeError(err)));
    response.on("error", (err) => reject(normalizeError(err)));
  });
}

function normalizeError(err: unknown, signal?: AbortSignal): SiteFetchError {
  if (err instanceof SiteFetchError) return err;
  if (signal?.aborted || (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))) {
    return new SiteFetchError("timeout", "Tempo limite excedido ao buscar o site");
  }
  return new SiteFetchError("network", err instanceof Error ? err.message : String(err));
}

function decode(body: Buffer, contentType: string): string {
  const charset = /charset=([\w-]+)/.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", ordm: "º", ordf: "ª",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", Agrave: "À", acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", iexcl: "¡", iquest: "¿",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** Converte HTML em texto legível: remove script/style/etc., tags e entidades; preserva título e meta description. */
export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1];

  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|canvas|object)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr|\/header|\/footer)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const parts = [title, description, body].filter(Boolean).map((part) => decodeEntities(part!));
  return parts
    .join("\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

const ABOUT_PATTERN = /(sobre|about|quem-somos|quem_somos|institucional|nossa-historia|a-empresa|nosotros|quienes-somos|company)/i;

/** Procura no HTML da home um link para a página "sobre"/"about" no mesmo site. */
export function findAboutUrl(html: string, baseUrl: string): string | null {
  const base = new URL(baseUrl);
  const sameSite = (host: string) => host.replace(/^www\./, "") === base.hostname.replace(/^www\./, "");
  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);

  for (const [, href, label] of anchors) {
    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      continue;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") continue;
    if (!sameSite(target.hostname)) continue;
    if (target.pathname === "/" || target.pathname === base.pathname) continue;
    const labelText = label.replace(/<[^>]+>/g, " ");
    if (ABOUT_PATTERN.test(target.pathname) || /^\s*(sobre|about|quem somos|nosotros)\b/i.test(labelText)) {
      target.hash = "";
      return target.toString();
    }
  }
  return null;
}

/** Busca a home e, se houver, a página "sobre". Nunca lança: falhas viram `status: "failed"`. */
export async function fetchSite(website: string | undefined, options: SiteFetcherOptions = {}): Promise<SiteContent> {
  if (!website) return { status: "skipped", pages: [] };

  const opts = {
    lookup: options.lookup ?? defaultLookup,
    isBlocked: options.isBlocked ?? isBlockedAddress,
    timeoutMs: options.timeoutMs ?? SITE_DEFAULTS.timeoutMs,
    maxBytes: options.maxBytes ?? SITE_DEFAULTS.maxBytes,
    maxRedirects: options.maxRedirects ?? SITE_DEFAULTS.maxRedirects,
  };
  const maxChars = options.maxChars ?? SITE_DEFAULTS.maxChars;

  let home: RawPage;
  try {
    home = await fetchHtml(website, opts);
  } catch (err) {
    const failure = normalizeError(err);
    console.warn(`[briefly] site indisponível (${failure.reason}): ${failure.message}`);
    return { status: "failed", pages: [], failureReason: failure.reason };
  }

  const homeText = htmlToText(home.html);
  const pages: SitePage[] = [];

  const aboutUrl = findAboutUrl(home.html, home.url);
  let aboutText = "";
  if (aboutUrl) {
    try {
      const about = await fetchHtml(aboutUrl, opts);
      aboutText = htmlToText(about.html).slice(0, SITE_DEFAULTS.aboutMaxChars);
      if (aboutText) pages.push({ url: about.url, text: aboutText });
    } catch (err) {
      console.warn(`[briefly] página "sobre" ignorada: ${normalizeError(err).message}`);
    }
  }

  const homeSlice = homeText.slice(0, Math.max(0, maxChars - aboutText.length));
  if (homeSlice) pages.unshift({ url: home.url, text: homeSlice });

  if (!pages.length) return { status: "failed", pages: [], failureReason: "unsupported_content" };
  return { status: "ok", pages };
}
