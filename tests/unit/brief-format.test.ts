import { describe, expect, it } from "vitest";

import { briefToText, SECTION_KEYS, SECTION_TITLES, sectionToText } from "@/lib/brief-format";
import { makeBrief } from "../fixtures/data";

describe("brief-format", () => {
  const brief = makeBrief({
    sources: [
      { claim: "Empresa informada", url: "input" },
      { claim: "Fato do site", url: "https://empresa.example/sobre" },
    ],
  });

  it("numera listas e formata objeções", () => {
    expect(sectionToText(brief, "hooks")).toBe("1. Gancho 1\n2. Gancho 2\n3. Gancho 3");
    expect(sectionToText(brief, "likelyObjections")).toBe("1. Objeção: Objeção\n   Resposta: Resposta");
  });

  it("marca fontes da entrada como 'informado por você'", () => {
    expect(sectionToText(brief, "sources")).toBe(
      "- Empresa informada (informado por você)\n- Fato do site (https://empresa.example/sobre)",
    );
  });

  it("'copiar tudo' inclui todas as seções na ordem", () => {
    const text = briefToText(brief, "Empresa Exemplo");
    expect(text.startsWith("Brief: Empresa Exemplo (confiança alta)")).toBe(true);
    const positions = SECTION_KEYS.map((key) => text.indexOf(`## ${SECTION_TITLES[key]}`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
