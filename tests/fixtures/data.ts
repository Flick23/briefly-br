import type { Brief, BriefRequestInput } from "@/lib/schemas";

/** Dados 100% fictícios. Não use nomes de empresas ou pessoas reais em testes. */

export const OFFER_FIXTURE = {
  productName: "Orbita Agenda",
  valueProposition: "Reduz faltas em consultas com lembretes automáticos e confirmação em um clique.",
  icp: "Clínicas com 3 a 20 profissionais que agendam por telefone ou mensagem.",
  differentiators: ["Implantação em um dia", "Sem fidelidade"],
  commonObjections: ["Já usamos planilha", "Não temos tempo para implantar"],
  language: "pt-BR",
} satisfies BriefRequestInput["offer"];

export const PROSPECT_FIXTURE = {
  companyName: "Clínica Vale Azul",
  website: "valeazul.example",
  contactName: "Fulana de Tal",
  contactRole: "Gerente administrativa",
  industry: "Saúde",
  notes: "Abriu uma segunda unidade recentemente.",
} satisfies BriefRequestInput["prospect"];

export const REQUEST_FIXTURE: BriefRequestInput = {
  offer: OFFER_FIXTURE,
  prospect: PROSPECT_FIXTURE,
};

export function makeBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    summary: "Resumo fictício.",
    fitHypothesis: "Hipótese fictícia.",
    angle: "Ângulo fictício.",
    hooks: ["Gancho 1", "Gancho 2", "Gancho 3"],
    likelyObjections: [{ objection: "Objeção", response: "Resposta" }],
    discoveryQuestions: ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?"],
    nextStep: "Agendar conversa.",
    microScript: "Olá! Faz sentido conversarmos?",
    sources: [{ claim: "Empresa informada", url: "input" }],
    confidence: "alta",
    ...overrides,
  };
}
