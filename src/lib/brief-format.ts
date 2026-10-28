import { INPUT_SOURCE, type Brief, type Confidence, type SiteFailureReason } from "@/lib/schemas";

/** Seções do brief na ordem de exibição. Usado pelos cards e pelo "copiar tudo". */

export const SECTION_KEYS = [
  "summary",
  "fitHypothesis",
  "angle",
  "hooks",
  "likelyObjections",
  "discoveryQuestions",
  "nextStep",
  "microScript",
  "sources",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_TITLES: Record<SectionKey, string> = {
  summary: "Resumo",
  fitHypothesis: "Hipótese de fit",
  angle: "Ângulo da abordagem",
  hooks: "Ganchos de abertura",
  likelyObjections: "Objeções prováveis",
  discoveryQuestions: "Perguntas de descoberta",
  nextStep: "Próximo passo",
  microScript: "Microscript",
  sources: "Fontes",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};

export const SITE_ERROR_LABELS: Record<SiteFailureReason, string> = {
  invalid_url: "URL inválida",
  blocked_host: "endereço bloqueado por segurança",
  timeout: "o site demorou mais de 8 s para responder",
  too_large: "página grande demais",
  http_status: "o site recusou o acesso ou respondeu com erro",
  unsupported_content: "o endereço não é uma página HTML legível",
  too_many_redirects: "redirecionamentos demais",
  network: "falha de rede ou de DNS",
};

export function sourceLabel(url: string): string {
  return url === INPUT_SOURCE ? "informado por você" : url;
}

export function sectionToText(brief: Brief, key: SectionKey): string {
  switch (key) {
    case "hooks":
    case "discoveryQuestions":
      return brief[key].map((item, index) => `${index + 1}. ${item}`).join("\n");
    case "likelyObjections":
      return brief.likelyObjections
        .map((item, index) => `${index + 1}. Objeção: ${item.objection}\n   Resposta: ${item.response}`)
        .join("\n");
    case "sources":
      return brief.sources.length
        ? brief.sources.map((source) => `- ${source.claim} (${sourceLabel(source.url)})`).join("\n")
        : "Nenhuma fonte citada.";
    default:
      return brief[key];
  }
}

export function briefToText(brief: Brief, companyName: string): string {
  const header = `Brief: ${companyName} (${CONFIDENCE_LABELS[brief.confidence].toLowerCase()})`;
  const sections = SECTION_KEYS.map((key) => `## ${SECTION_TITLES[key]}\n${sectionToText(brief, key)}`);
  return [header, ...sections].join("\n\n");
}
