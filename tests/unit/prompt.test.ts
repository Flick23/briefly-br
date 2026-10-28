import { describe, expect, it } from "vitest";

import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";
import { BriefRequestSchema, LANGUAGES, type Offer, type Prospect } from "@/lib/schemas";

/**
 * Teste anti-acoplamento: o prompt precisa servir para qualquer operação de SDR.
 * Nenhum setor, empresa ou produto pode estar fixo no texto — tudo vem da entrada.
 */

const SENTINEL = "§§";

/** Oferta e prospect com marcadores no lugar de todo conteúdo variável. */
function sentinelInput(): { offer: Offer; prospect: Prospect } {
  return BriefRequestSchema.parse({
    offer: {
      productName: `${SENTINEL}produto`,
      valueProposition: `${SENTINEL}proposta`,
      icp: `${SENTINEL}icp`,
      differentiators: [`${SENTINEL}dif`],
      commonObjections: [`${SENTINEL}obj`],
    },
    prospect: {
      companyName: `${SENTINEL}empresa`,
      website: "sentinela.example",
      contactName: `${SENTINEL}contato`,
      contactRole: `${SENTINEL}cargo`,
      industry: `${SENTINEL}setor`,
      notes: `${SENTINEL}notas`,
    },
  });
}

/** Texto fixo do prompt: tudo o que sobra depois de remover o conteúdo que veio da entrada. */
function staticPromptText(): string {
  const { offer, prospect } = sentinelInput();
  const pages = [{ url: "https://sentinela.example/", text: `${SENTINEL}site` }];
  const parts = [...LANGUAGES.map(buildSystemPrompt), buildUserPrompt(offer, prospect, pages, `${SENTINEL}erro`)];
  return parts
    .join("\n")
    .replace(new RegExp(`${SENTINEL}\\w+`, "g"), "")
    .replaceAll("https://sentinela.example/", "")
    .replaceAll("sentinela.example", "");
}

// Termos genéricos de setores e tipos de produto. Se algum aparecer no texto fixo,
// o prompt está enviesado para um mercado específico.
const SECTOR_TERMS = [
  "saas", "software", "e-commerce", "ecommerce", "loja", "varejo", "indústria", "industria",
  "fábrica", "clínica", "clinica", "hospital", "saúde", "agência", "agencia", "marketing",
  "fintech", "banco", "seguro", "educação", "escola", "imobiliária", "construtora", "advocacia",
  "contabilidade", "logística", "restaurante", "academia", "crm", "erp", "plataforma", "aplicativo",
  "startup", "b2b", "b2c", "marketplace", "consultoria",
];

describe("prompt genérico (anti-acoplamento)", () => {
  const text = staticPromptText().toLowerCase();

  it.each(SECTOR_TERMS)("não contém o termo de setor/produto fixo %j", (term) => {
    expect(text).not.toMatch(new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, "u"));
  });

  it("não contém domínios, URLs nem marcas registradas fixas", () => {
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/\b[\w-]+\.(com|com\.br|io|net|org|ai|app)\b/);
    expect(text).not.toMatch(/[®™]/);
  });

  it("o system prompt não depende da oferta, só do idioma", () => {
    const { offer } = sentinelInput();
    const other: Offer = { ...offer, productName: "Outro Produto Fictício", icp: "Outro perfil" };
    expect(buildSystemPrompt(offer.language)).toBe(buildSystemPrompt(other.language));
    expect(buildSystemPrompt("pt-BR")).not.toContain(offer.productName);
  });

  it("todo campo da oferta e do prospect chega ao prompt do usuário", () => {
    const { offer, prospect } = sentinelInput();
    const user = buildUserPrompt(offer, prospect, []);
    for (const value of [
      offer.productName, offer.valueProposition, offer.icp, ...offer.differentiators!, ...offer.commonObjections!,
      prospect.companyName, prospect.website!, prospect.contactName!, prospect.contactRole!, prospect.industry!, prospect.notes!,
    ]) {
      expect(user).toContain(value);
    }
  });
});

describe("regras obrigatórias do prompt", () => {
  const system = buildSystemPrompt("pt-BR");

  it("exige só fatos da entrada ou do site, com origem em sources", () => {
    expect(system).toMatch(/somente fatos presentes na entrada do usuário/i);
    expect(system).toMatch(/"sources"/);
    expect(system).toContain('"input"');
  });

  it("proíbe inventar números, clientes, faturamento e ferramentas", () => {
    expect(system).toMatch(/nunca invente números, clientes, faturamento/i);
    expect(system).toMatch(/ferramentas/i);
  });

  it("trata o conteúdo do site como dado não confiável", () => {
    expect(system).toMatch(/não confiável/i);
  });

  it.each([
    ["pt-BR", "português do Brasil"],
    ["en", "inglês"],
    ["es", "espanhol"],
  ] as const)("responde no idioma da oferta (%s)", (language, name) => {
    expect(buildSystemPrompt(language)).toContain(name);
  });

  it("sinaliza ausência de site no prompt do usuário", () => {
    const { offer, prospect } = sentinelInput();
    expect(buildUserPrompt(offer, prospect, [])).toContain("nenhum conteúdo de site disponível");
  });
});
