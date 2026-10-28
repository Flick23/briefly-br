import type { OfferInput, ProspectInput } from "@/lib/schemas";

/** Dados de exemplo 100% fictícios, usados pelo botão "Preencher exemplo". */

export const EXAMPLE_OFFER: OfferInput = {
  productName: "Agenda Viva",
  valueProposition:
    "Reduz faltas em atendimentos com lembretes automáticos por mensagem e confirmação em um clique.",
  icp: "Clínicas e consultórios com 3 a 20 profissionais que agendam por telefone ou mensagem.",
  differentiators: ["Implantação em um dia", "Sem fidelidade", "Suporte em português por chat"],
  commonObjections: [
    "Já usamos planilha e funciona",
    "Nossos pacientes não respondem mensagens",
    "Não temos tempo para implantar agora",
  ],
  language: "pt-BR",
};

export const EXAMPLE_PROSPECT: ProspectInput = {
  companyName: "Clínica Horizonte Azul",
  website: "",
  contactName: "Mariana Exemplo",
  contactRole: "Gerente administrativa",
  industry: "Saúde: clínica multiprofissional",
  notes: "Abriu uma segunda unidade há poucos meses e está contratando recepcionistas.",
};
