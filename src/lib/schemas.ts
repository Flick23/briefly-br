import { z } from "zod";

/**
 * Fonte única dos contratos do Briefly. A rota da API e o formulário do front
 * importam daqui, então nomes de campo e regras nunca divergem.
 */

export const LANGUAGES = ["pt-BR", "en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LIMITS = {
  shortText: 120,
  longText: 1000,
  notes: 2000,
  listItem: 300,
  listSize: 10,
} as const;

/** Texto opcional: aparado; string vazia vira `undefined`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((value) => (value ? value : undefined));

const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label} é obrigatório` })
    .trim()
    .min(1, `${label} é obrigatório`)
    .max(max, `Use no máximo ${max} caracteres`);

/** Lista de textos curtos: itens vazios são descartados. */
const textList = z
  .array(z.string().trim().max(LIMITS.listItem, `Cada item pode ter no máximo ${LIMITS.listItem} caracteres`))
  .max(LIMITS.listSize, `Informe no máximo ${LIMITS.listSize} itens`)
  .optional()
  .transform((items) => {
    const filled = items?.filter(Boolean) ?? [];
    return filled.length ? filled : undefined;
  });

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Normaliza o site informado: aceita com ou sem `https://`, exige http/https e
 * um domínio com ponto. Retorna a URL canônica (sem fragmento).
 */
export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
  url.hash = "";
  return url.toString();
}

const websiteField = z
  .string()
  .trim()
  .max(2048, "URL longa demais")
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const normalized = normalizeWebsite(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Informe um site válido, ex.: empresa.com.br" });
      return z.NEVER;
    }
    return normalized;
  });

export const OfferSchema = z.object({
  productName: requiredText(LIMITS.shortText, "Nome do produto"),
  valueProposition: requiredText(LIMITS.longText, "Proposta de valor"),
  icp: requiredText(LIMITS.longText, "ICP"),
  differentiators: textList,
  commonObjections: textList,
  language: z.enum(LANGUAGES).default("pt-BR"),
});

export const ProspectSchema = z.object({
  companyName: requiredText(LIMITS.shortText, "Nome da empresa"),
  website: websiteField,
  contactName: optionalText(LIMITS.shortText),
  contactRole: optionalText(LIMITS.shortText),
  industry: optionalText(LIMITS.shortText),
  notes: optionalText(LIMITS.notes),
});

export const BriefRequestSchema = z.object({
  offer: OfferSchema,
  prospect: ProspectSchema,
});

/** Formato aceito na entrada (antes das transformações) — útil para o formulário. */
export type OfferInput = z.input<typeof OfferSchema>;
export type ProspectInput = z.input<typeof ProspectSchema>;
export type BriefRequestInput = z.input<typeof BriefRequestSchema>;
/** Formato já validado e normalizado. */
export type Offer = z.output<typeof OfferSchema>;
export type Prospect = z.output<typeof ProspectSchema>;
export type BriefRequest = z.output<typeof BriefRequestSchema>;

/** Valor especial de `sources[].url` para fatos vindos da entrada do usuário. */
export const INPUT_SOURCE = "input";

export const CONFIDENCE_LEVELS = ["alta", "media", "baixa"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const BriefSchema = z.object({
  summary: z.string().min(1).describe("Resumo do prospect em 2 a 4 frases, só com fatos da entrada ou do site."),
  fitHypothesis: z.string().min(1).describe("Hipótese de por que a oferta faz sentido para este prospect."),
  angle: z.string().min(1).describe("Ângulo principal da abordagem."),
  hooks: z.array(z.string().min(1)).length(3).describe("Exatamente 3 ganchos curtos de abertura."),
  likelyObjections: z
    .array(
      z.object({
        objection: z.string().min(1),
        response: z.string().min(1),
      }),
    )
    .min(1)
    .max(5)
    .describe("Objeções prováveis com resposta sugerida."),
  discoveryQuestions: z.array(z.string().min(1)).min(3).max(5).describe("De 3 a 5 perguntas de descoberta."),
  nextStep: z.string().min(1).describe("Próximo passo concreto proposto ao prospect."),
  microScript: z.string().min(1).describe("Script curto de abordagem (mensagem ou ligação)."),
  sources: z
    .array(
      z.object({
        claim: z.string().min(1).describe("Fato usado no brief."),
        url: z
          .string()
          .min(1)
          .describe(`URL da página do site de onde o fato saiu, ou "${INPUT_SOURCE}" se veio da entrada do usuário.`),
      }),
    )
    .describe("Origem de cada fato sobre o prospect."),
  confidence: z.enum(CONFIDENCE_LEVELS).describe("alta, media ou baixa, conforme a quantidade e qualidade dos fatos."),
});

export type Brief = z.output<typeof BriefSchema>;

export type SiteStatus = "ok" | "skipped" | "failed";

export interface BriefResponse {
  brief: Brief;
  meta: { site: SiteStatus; pages: string[]; mock: boolean };
}
