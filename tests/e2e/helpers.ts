import { expect, type Page } from "@playwright/test";

/** Dados fictícios para os testes e2e. */
export const OFFER = {
  productName: "Rota Leve",
  valueProposition: "Planeja rotas de entrega em minutos e reduz quilômetros rodados.",
  icp: "Distribuidoras com 5 a 50 veículos que montam rotas em planilha.",
  differentiators: ["Sem instalação", "Treinamento em uma hora"],
  commonObjections: ["Nosso motorista já conhece as rotas"],
};

export const PROSPECT = {
  companyName: "Distribuidora Ponto Norte",
  contactName: "Carlos Fictício",
  contactRole: "Coordenador de logística",
  industry: "Distribuição de bebidas",
  notes: "Anunciou vagas para motoristas.",
};

/** Cadastra uma oferta pelo formulário "Minha oferta" e espera o resumo salvo. */
export async function createOffer(page: Page, offer = OFFER) {
  const form = page.getByRole("form", { name: "Formulário da oferta" });
  await form.getByLabel("Produto ou serviço").fill(offer.productName);
  await form.getByLabel("Proposta de valor").fill(offer.valueProposition);
  await form.getByLabel("ICP (cliente ideal)").fill(offer.icp);
  await form.getByLabel("Diferenciais").fill(offer.differentiators.join("\n"));
  await form.getByLabel("Objeções comuns").fill(offer.commonObjections.join("\n"));
  await form.getByRole("button", { name: "Salvar oferta" }).click();
  await expect(page.getByTestId("offer-summary")).toContainText(offer.productName);
}

export async function fillProspect(page: Page, prospect: Partial<typeof PROSPECT> & { website?: string } = PROSPECT) {
  const form = page.getByRole("form", { name: "Formulário do prospect" });
  if (prospect.companyName !== undefined) await form.getByLabel("Empresa").fill(prospect.companyName);
  if (prospect.website !== undefined) await form.getByLabel("Site").fill(prospect.website);
  if (prospect.contactName !== undefined) await form.getByLabel("Nome do contato").fill(prospect.contactName);
  if (prospect.contactRole !== undefined) await form.getByLabel("Cargo do contato").fill(prospect.contactRole);
  if (prospect.industry !== undefined) await form.getByLabel("Segmento").fill(prospect.industry);
  if (prospect.notes !== undefined) await form.getByLabel("Observações").fill(prospect.notes);
}

export function generateButton(page: Page) {
  return page.getByRole("button", { name: "Gerar brief" });
}
