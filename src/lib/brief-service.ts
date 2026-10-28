import { ProviderError } from "@/lib/errors";
import { createLlmClient, type LlmClient } from "@/lib/llm";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";
import { BriefSchema, INPUT_SOURCE, type Brief, type BriefRequest, type BriefResponse } from "@/lib/schemas";
import { fetchSite as defaultFetchSite, type SiteContent } from "@/lib/site-fetcher";

/** Busca o site -> monta o prompt -> chama o LLM -> valida a saída (com uma nova tentativa). */

export interface BriefServiceDeps {
  llm?: LlmClient;
  fetchSite?: (website: string | undefined) => Promise<SiteContent>;
}

export const MAX_ATTEMPTS = 2;

export async function generateBrief(input: BriefRequest, deps: BriefServiceDeps = {}): Promise<BriefResponse> {
  const llm = deps.llm ?? createLlmClient();
  const fetchSite = deps.fetchSite ?? defaultFetchSite;

  const site = await fetchSite(input.prospect.website);
  const system = buildSystemPrompt(input.offer.language);

  let feedback: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const user = buildUserPrompt(input.offer, input.prospect, site.pages, feedback);
    const raw = await llm.generate({ system, user, context: { input, pages: site.pages } });

    const result = parseBrief(raw);
    if (result.ok) {
      return {
        brief: enforceGrounding(result.brief, site),
        meta: { site: site.status, pages: site.pages.map((page) => page.url), mock: llm.mock },
      };
    }

    feedback = result.error;
    console.warn(`[briefly] saída do modelo inválida (tentativa ${attempt}/${MAX_ATTEMPTS}): ${result.error}`);
  }

  throw new ProviderError(`Saída do modelo inválida após ${MAX_ATTEMPTS} tentativas: ${feedback}`);
}

type ParseResult = { ok: true; brief: Brief } | { ok: false; error: string };

function parseBrief(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "resposta não é um JSON válido" };
  }
  const parsed = BriefSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: issues };
  }
  return { ok: true, brief: parsed.data };
}

/**
 * Regras que não dependem do modelo:
 * - só ficam fontes da entrada do usuário ou de páginas realmente buscadas;
 * - sem site legível, a confiança é sempre "baixa".
 */
function enforceGrounding(brief: Brief, site: SiteContent): Brief {
  const fetched = new Set(site.pages.map((page) => page.url));
  const seen = new Set<string>();
  const sources = brief.sources.filter((source) => {
    const allowed = source.url === INPUT_SOURCE || fetched.has(source.url);
    const key = `${source.url}|${source.claim}`;
    if (!allowed || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const dropped = brief.sources.length - sources.length;
  if (dropped > 0) console.warn(`[briefly] ${dropped} fonte(s) descartada(s) por não virem da entrada nem do site`);

  return {
    ...brief,
    sources,
    confidence: site.status === "ok" ? brief.confidence : "baixa",
  };
}
