import { expect, test } from "@playwright/test";

import { BriefRequestSchema, BriefSchema, OfferSchema, ProspectSchema } from "../../src/lib/schemas";
import { SECTION_TITLES } from "../../src/lib/brief-format";
import { createOffer, fillProspect, generateButton, OFFER, PROSPECT } from "./helpers";

test.describe("fluxo do formulário (LLM mockado)", () => {
  test("cria a oferta, preenche o prospect, gera e vê o resultado", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Briefly" })).toBeVisible();

    await createOffer(page);
    await fillProspect(page);
    await generateButton(page).click();

    const result = page.getByTestId("brief-result");
    await expect(result).toBeVisible();
    await expect(result.getByRole("heading", { level: 2, name: `Brief: ${PROSPECT.companyName}` })).toBeVisible();
    for (const title of Object.values(SECTION_TITLES)) {
      await expect(result.getByRole("heading", { level: 3, name: title })).toBeVisible();
    }
    await expect(page.getByTestId("confidence")).toHaveText("Confiança baixa");
    await expect(page.getByTestId("site-status")).toHaveText(/Sem site informado/);
    await expect(result.getByText("Modo demonstração (sem IA)")).toBeVisible();
    await expect(result.getByText(OFFER.productName).first()).toBeVisible();
    await expect(result.getByText("(informado por você)").first()).toBeVisible();
  });

  test("o corpo enviado pelo front passa na validação do back, com os mesmos nomes de campo", async ({ page }) => {
    await page.goto("/");
    await createOffer(page);
    await fillProspect(page, { ...PROSPECT, website: "ponto-norte.example" });

    const [request, response] = await Promise.all([
      page.waitForRequest((req) => req.url().endsWith("/api/brief") && req.method() === "POST"),
      page.waitForResponse((res) => res.url().endsWith("/api/brief")),
      generateButton(page).click(),
    ]);

    const body = request.postDataJSON();
    const parsed = BriefRequestSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

    // Zod descarta chaves desconhecidas em silêncio; aqui garantimos que nenhuma
    // chave do front fica fora do schema (nomes divergentes perderiam dados).
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["offer", "prospect"]));
    for (const key of Object.keys(body.offer)) expect(Object.keys(OfferSchema.shape)).toContain(key);
    for (const key of Object.keys(body.prospect)) expect(Object.keys(ProspectSchema.shape)).toContain(key);

    expect(parsed.data?.offer.differentiators).toEqual(OFFER.differentiators);
    expect(parsed.data?.prospect.website).toBe("https://ponto-norte.example/");

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(BriefSchema.safeParse(json.brief).success).toBe(true);
    // Domínio .example nunca resolve: o brief sai mesmo assim, com o motivo da falha.
    expect(json.meta).toMatchObject({ site: "failed", siteError: "network", mock: true });
    await expect(page.getByTestId("site-status")).toHaveText(/Não foi possível ler o site \(falha de rede ou de DNS\)/);
  });

  test("valida o prospect no front sem chamar a API", async ({ page }) => {
    let calls = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/brief")) calls++;
    });
    await page.goto("/");
    await createOffer(page);
    await fillProspect(page, { companyName: "", website: "ftp://arquivos.example" });
    await generateButton(page).click();

    await expect(page.locator("#prospect-companyName-error")).toHaveText("Nome da empresa é obrigatório");
    await expect(page.locator("#prospect-website-error")).toHaveText("Informe um site válido, ex.: empresa.com.br");
    await expect(page.getByLabel("Empresa")).toHaveAttribute("aria-invalid", "true");
    expect(calls).toBe(0);
  });

  test("pede a oferta antes de gerar", async ({ page }) => {
    await page.goto("/");
    await fillProspect(page, { companyName: "Empresa Sem Oferta" });
    await generateButton(page).click();
    await expect(page.getByTestId("brief-error")).toContainText("Falta a sua oferta");
  });

  test("mostra a mensagem legível quando a API falha", async ({ page }) => {
    await page.route("**/api/brief", (route) =>
      route.fulfill({
        status: 502,
        json: { error: { code: "provider_error", message: "O serviço de IA falhou ao gerar o brief. Tente de novo em instantes." } },
      }),
    );
    await page.goto("/");
    await createOffer(page);
    await fillProspect(page, { companyName: "Empresa Qualquer" });
    await generateButton(page).click();
    await expect(page.getByTestId("brief-error")).toContainText("O serviço de IA falhou ao gerar o brief");
  });

  test("devolve ao campo certo os erros de validação do back", async ({ page }) => {
    await page.route("**/api/brief", (route) =>
      route.fulfill({
        status: 400,
        json: {
          error: {
            code: "invalid_input",
            message: "Alguns campos estão inválidos. Revise e tente de novo.",
            details: [{ path: "prospect.notes", message: "Mensagem de erro do servidor" }],
          },
        },
      }),
    );
    await page.goto("/");
    await createOffer(page);
    await fillProspect(page, { companyName: "Empresa Qualquer" });
    await generateButton(page).click();
    await expect(page.locator("#prospect-notes-error")).toHaveText("Mensagem de erro do servidor");
  });

  test("mostra skeleton enquanto o brief é gerado", async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/brief", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/");
    await createOffer(page);
    await fillProspect(page, { companyName: "Empresa Lenta" });
    await generateButton(page).click();

    await expect(page.getByTestId("brief-loading")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerando brief…" })).toBeDisabled();
    release();
    await expect(page.getByTestId("brief-result")).toBeVisible();
  });
});

test.describe("perfis de oferta", () => {
  test("salva vários perfis, alterna entre eles e mantém após recarregar", async ({ page }) => {
    await page.goto("/");
    await createOffer(page);
    await page.getByRole("button", { name: "Nova oferta" }).click();
    await createOffer(page, { ...OFFER, productName: "Segunda Oferta" });

    const picker = page.getByLabel("Perfil ativo", { exact: true });
    await expect(picker.locator("option")).toHaveText([OFFER.productName, "Segunda Oferta"]);
    await expect(picker).toHaveValue(/.+/);

    await picker.selectOption({ label: OFFER.productName });
    await expect(page.getByTestId("offer-summary")).toContainText(OFFER.productName);

    await page.reload();
    await expect(page.getByLabel("Perfil ativo", { exact: true }).locator("option")).toHaveText([OFFER.productName, "Segunda Oferta"]);
    await expect(page.getByTestId("offer-summary")).toContainText(OFFER.productName);
  });

  test("preencher exemplo cria a oferta e o prospect fictícios", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Preencher exemplo" }).click();
    await expect(page.getByTestId("offer-summary")).toContainText("Agenda Viva");
    await expect(page.getByLabel("Empresa")).toHaveValue("Clínica Horizonte Azul");
    await generateButton(page).click();
    await expect(page.getByTestId("brief-result")).toBeVisible();
  });
});

test.describe("cópia", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copia uma seção e o brief inteiro", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Preencher exemplo" }).click();
    await generateButton(page).click();
    await expect(page.getByTestId("brief-result")).toBeVisible();

    await page.getByRole("button", { name: "Copiar ganchos de abertura" }).click();
    const hooks = await page.evaluate(() => navigator.clipboard.readText());
    expect(hooks).toMatch(/^1\. [\s\S]+\n2\. [\s\S]+\n3\. [\s\S]+$/);

    await page.getByRole("button", { name: "Copiar brief completo" }).click();
    const all = await page.evaluate(() => navigator.clipboard.readText());
    expect(all).toContain("Brief: Clínica Horizonte Azul");
    for (const title of Object.values(SECTION_TITLES)) expect(all).toContain(`## ${title}`);
  });
});

test.describe("responsivo", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("funciona em 375px sem scroll horizontal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Preencher exemplo" }).click();
    await generateButton(page).click();
    await expect(page.getByTestId("brief-result")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("GET /api/health responde sem expor valores", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(["commit", "hasApiKey", "hasModel", "mock", "ok"]);
  expect(body).toMatchObject({ ok: true, mock: true });
});
