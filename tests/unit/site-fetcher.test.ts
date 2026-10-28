import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fetchSite, findAboutUrl, htmlToText, isBlockedAddress, type LookupFn } from "@/lib/site-fetcher";

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", "loopback 127/8"],
    ["127.255.255.254", "loopback 127/8 (fim)"],
    ["10.0.0.1", "privada 10/8"],
    ["10.255.255.255", "privada 10/8 (fim)"],
    ["172.16.0.1", "privada 172.16/12"],
    ["172.31.255.255", "privada 172.16/12 (fim)"],
    ["192.168.0.1", "privada 192.168/16"],
    ["192.168.255.255", "privada 192.168/16 (fim)"],
    ["169.254.169.254", "link-local 169.254/16 (metadados de nuvem)"],
    ["0.0.0.0", "rede 0/8"],
    ["100.64.0.1", "CGNAT 100.64/10"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "loopback IPv6"],
    ["::", "IPv6 não especificado"],
    ["fc00::1", "ULA fc00::/7"],
    ["fdff:ffff::1", "ULA fc00::/7 (fd)"],
    ["fe80::1", "link-local IPv6"],
    ["::ffff:127.0.0.1", "IPv4 mapeado em IPv6"],
    ["::ffff:10.0.0.1", "IPv4 privado mapeado em IPv6"],
    ["[::1]", "IPv6 entre colchetes"],
    ["nao-e-ip", "entrada que não é IP"],
  ])("bloqueia %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "192.169.0.1", "2606:4700:4700::1111"])(
    "permite IP público %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("fetchSite: bloqueios anti-SSRF", () => {
  it("retorna skipped quando não há site", async () => {
    await expect(fetchSite(undefined)).resolves.toEqual({ status: "skipped", pages: [] });
  });

  it.each([
    "http://127.0.0.1/",
    "http://10.1.2.3/",
    "http://172.20.0.1/",
    "http://192.168.0.10/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://localhost:3000/",
    "http://app.localhost/",
  ])("bloqueia %s sem abrir conexão", async (url) => {
    const lookup = vi.fn<LookupFn>(async () => [{ address: "127.0.0.1", family: 4 }]);
    const result = await fetchSite(url, { lookup });
    expect(result).toMatchObject({ status: "failed", failureReason: "blocked_host" });
  });

  it("bloqueia hostname que resolve para IP privado (checagem após o DNS)", async () => {
    const lookup: LookupFn = async () => [{ address: "10.0.0.5", family: 4 }];
    const result = await fetchSite("https://interno.example/", { lookup });
    expect(result).toMatchObject({ status: "failed", failureReason: "blocked_host" });
  });

  it("bloqueia se qualquer IP resolvido for privado", async () => {
    const lookup: LookupFn = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "fd00::1", family: 6 },
    ];
    const result = await fetchSite("https://misto.example/", { lookup });
    expect(result).toMatchObject({ status: "failed", failureReason: "blocked_host" });
  });

  it("recusa protocolos que não sejam http/https", async () => {
    const result = await fetchSite("ftp://arquivos.example/");
    expect(result).toMatchObject({ status: "failed", failureReason: "invalid_url" });
  });
});

describe("fetchSite com servidor local", () => {
  let server: http.Server;
  let port: number;
  const routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void> = {};

  // "publico.test" aponta para o servidor local; "interno.test", para uma rede privada.
  const lookup: LookupFn = async (hostname) =>
    hostname === "interno.test" ? [{ address: "10.0.0.7", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
  // Libera o loopback só neste teste (é onde está o servidor fake); o resto segue a regra real.
  const isBlocked = (address: string) => address !== "127.0.0.1" && isBlockedAddress(address);
  const base = () => `http://publico.test:${port}`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const handler = routes[req.url ?? ""];
      if (handler) handler(req, res);
      else res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;

    routes["/"] = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><title>Empresa Exemplo</title>
        <meta name="description" content="Soluções fictícias &amp; serviços">
        <style>.x{color:red}</style><script>window.segredo = "nao-deve-aparecer";</script></head>
        <body><nav><a href="/contato">Contato</a> <a href="/sobre-nos">Sobre nós</a></nav>
        <h1>Bem-vindo à Empresa Exemplo</h1><p>Atendemos clientes fictícios desde sempre.</p>
        <noscript>ative o javascript</noscript></body></html>`);
    };
    routes["/sobre-nos"] = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><h2>Nossa história</h2><p>Fundada para fins de teste.</p></body></html>");
    };
    routes["/redireciona-interno"] = (_req, res) => {
      res.writeHead(302, { Location: `http://interno.test:${port}/` }).end();
    };
    routes["/redireciona-ip-privado"] = (_req, res) => {
      res.writeHead(301, { Location: "http://10.0.0.9/admin" }).end();
    };
    routes["/lento"] = () => {
      /* nunca responde */
    };
    routes["/grande"] = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<p>${"a".repeat(5_000)}</p>`);
    };
    routes["/pdf"] = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/pdf" }).end("%PDF-1.4");
    };
    routes["/erro"] = (_req, res) => {
      res.writeHead(500).end();
    };
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("busca a home e a página 'sobre', com o texto limpo", async () => {
    const result = await fetchSite(`${base()}/`, { lookup, isBlocked });
    expect(result.status).toBe("ok");
    expect(result.pages.map((page) => page.url)).toEqual([`${base()}/`, `${base()}/sobre-nos`]);

    const [home, about] = result.pages;
    expect(home.text).toContain("Empresa Exemplo");
    expect(home.text).toContain("Soluções fictícias & serviços");
    expect(home.text).toContain("Atendemos clientes fictícios desde sempre.");
    expect(home.text).not.toMatch(/segredo|color:red|<\w+|ative o javascript/);
    expect(about.text).toContain("Fundada para fins de teste.");
  });

  it("não segue redirect para host que resolve em rede privada", async () => {
    const result = await fetchSite(`${base()}/redireciona-interno`, { lookup, isBlocked });
    expect(result).toMatchObject({ status: "failed", failureReason: "blocked_host" });
  });

  it("não segue redirect para IP literal bloqueado", async () => {
    const result = await fetchSite(`${base()}/redireciona-ip-privado`, { lookup, isBlocked });
    expect(result).toMatchObject({ status: "failed", failureReason: "blocked_host" });
  });

  it("aborta por timeout", async () => {
    const started = Date.now();
    const result = await fetchSite(`${base()}/lento`, { lookup, isBlocked, timeoutMs: 200 });
    expect(result).toMatchObject({ status: "failed", failureReason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("aborta quando a resposta passa do limite de bytes", async () => {
    const result = await fetchSite(`${base()}/grande`, { lookup, isBlocked, maxBytes: 1_000 });
    expect(result).toMatchObject({ status: "failed", failureReason: "too_large" });
  });

  it("corta o texto no limite de caracteres", async () => {
    const result = await fetchSite(`${base()}/grande`, { lookup, isBlocked, maxChars: 100 });
    expect(result.status).toBe("ok");
    expect(result.pages[0].text.length).toBeLessThanOrEqual(100);
  });

  it("trata conteúdo não-HTML e erro HTTP como site ilegível", async () => {
    await expect(fetchSite(`${base()}/pdf`, { lookup, isBlocked })).resolves.toMatchObject({
      status: "failed",
      failureReason: "unsupported_content",
    });
    await expect(fetchSite(`${base()}/erro`, { lookup, isBlocked })).resolves.toMatchObject({
      status: "failed",
      failureReason: "http_status",
    });
  });
});

describe("htmlToText", () => {
  it("remove script, style, comentários e tags, e decodifica entidades", () => {
    const html = `<html><head><title>T&iacute;tulo</title><style>p{}</style></head>
      <body><!-- oculto --><script>alert(1)</script><p>Ol&aacute;,&nbsp;mundo &#8212; &#x41;&lt;b&gt;</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Título");
    expect(text).toContain("Olá, mundo — A<b>");
    expect(text).not.toMatch(/alert|oculto|p\{\}/);
  });
});

describe("findAboutUrl", () => {
  it("encontra link 'sobre' no mesmo site e ignora links externos", () => {
    const html = `<a href="https://outro.example/sobre">Sobre</a><a href="/institucional#x">Institucional</a>`;
    expect(findAboutUrl(html, "https://www.empresa.example/")).toBe("https://www.empresa.example/institucional");
  });

  it("retorna null quando não há página sobre", () => {
    expect(findAboutUrl(`<a href="/contato">Contato</a>`, "https://empresa.example/")).toBeNull();
  });
});
