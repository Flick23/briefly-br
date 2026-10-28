import { describe, expect, it } from "vitest";

import { BriefRequestSchema, BriefSchema, normalizeWebsite } from "@/lib/schemas";
import { makeBrief, REQUEST_FIXTURE } from "../fixtures/data";

describe("BriefRequestSchema", () => {
  it("aceita uma entrada válida e normaliza o site", () => {
    const result = BriefRequestSchema.parse(REQUEST_FIXTURE);
    expect(result.prospect.website).toBe("https://valeazul.example/");
    expect(result.offer.language).toBe("pt-BR");
  });

  it("usa pt-BR como idioma padrão", () => {
    const { language: _omit, ...offer } = REQUEST_FIXTURE.offer;
    const result = BriefRequestSchema.parse({ ...REQUEST_FIXTURE, offer });
    expect(result.offer.language).toBe("pt-BR");
  });

  it("converte opcionais vazios em undefined e descarta itens vazios de listas", () => {
    const result = BriefRequestSchema.parse({
      offer: { ...REQUEST_FIXTURE.offer, differentiators: ["  ", "Rápido"], commonObjections: [""] },
      prospect: { companyName: "  Empresa Exemplo  ", website: "", contactName: "   ", notes: "" },
    });
    expect(result.prospect).toEqual({ companyName: "Empresa Exemplo" });
    expect(result.offer.differentiators).toEqual(["Rápido"]);
    expect(result.offer.commonObjections).toBeUndefined();
  });

  it("rejeita campos obrigatórios ausentes, apontando o caminho", () => {
    const result = BriefRequestSchema.safeParse({
      offer: { productName: "", valueProposition: "x" },
      prospect: {},
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining(["offer.productName", "offer.icp", "prospect.companyName"]),
    );
  });

  it("rejeita idioma fora da lista e textos longos demais", () => {
    const result = BriefRequestSchema.safeParse({
      offer: { ...REQUEST_FIXTURE.offer, language: "fr" },
      prospect: { companyName: "x".repeat(121) },
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["offer.language", "prospect.companyName"]));
  });

  it("rejeita site inválido com mensagem legível", () => {
    const result = BriefRequestSchema.safeParse({
      ...REQUEST_FIXTURE,
      prospect: { companyName: "Empresa", website: "ftp://arquivos.example" },
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path.join(".")).toBe("prospect.website");
    expect(result.error!.issues[0].message).toMatch(/site válido/);
  });
});

describe("normalizeWebsite", () => {
  it.each([
    ["empresa.example", "https://empresa.example/"],
    ["  www.empresa.example/sobre  ", "https://www.empresa.example/sobre"],
    ["http://empresa.example", "http://empresa.example/"],
    ["HTTPS://Empresa.Example/Path#secao", "https://empresa.example/Path"],
    ["https://empresa.example:8443/x?y=1", "https://empresa.example:8443/x?y=1"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizeWebsite(input)).toBe(expected);
  });

  it.each([
    "",
    "ftp://empresa.example",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "localhost",
    "http://usuario:senha@empresa.example",
    "não é url",
  ])("rejeita %j", (input) => {
    expect(normalizeWebsite(input)).toBeNull();
  });
});

describe("BriefSchema", () => {
  it("aceita um brief completo", () => {
    expect(BriefSchema.safeParse(makeBrief()).success).toBe(true);
  });

  it("exige exatamente 3 hooks e de 3 a 5 perguntas", () => {
    expect(BriefSchema.safeParse(makeBrief({ hooks: ["a", "b"] })).success).toBe(false);
    expect(BriefSchema.safeParse(makeBrief({ discoveryQuestions: ["a", "b"] })).success).toBe(false);
    expect(BriefSchema.safeParse(makeBrief({ discoveryQuestions: ["a", "b", "c", "d", "e", "f"] })).success).toBe(false);
  });

  it("rejeita confiança fora do enum", () => {
    expect(BriefSchema.safeParse({ ...makeBrief(), confidence: "altíssima" }).success).toBe(false);
  });
});
