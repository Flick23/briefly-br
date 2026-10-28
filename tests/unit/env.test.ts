import { describe, expect, it, vi } from "vitest";

import { getHealth, isMockEnabled } from "@/lib/env";
import { createLlmClient, MockLlmClient } from "@/lib/llm";

vi.mock("next/server", () => ({ connection: async () => {} }));

describe("isMockEnabled", () => {
  it.each(["1", "true", "TRUE", "True", " 1 ", "1\n", " true\r\n"])("liga com %j", (value) => {
    expect(isMockEnabled({ BRIEFLY_MOCK_LLM: value })).toBe(true);
  });

  it.each([undefined, "", " ", "0", "false", "yes", "on", "11"])("não liga com %j", (value) => {
    expect(isMockEnabled({ BRIEFLY_MOCK_LLM: value })).toBe(false);
  });
});

describe("createLlmClient", () => {
  it("o mock tem prioridade sobre a checagem de chave e modelo", () => {
    expect(createLlmClient({ BRIEFLY_MOCK_LLM: "true\n" })).toBeInstanceOf(MockLlmClient);
    expect(createLlmClient({ BRIEFLY_MOCK_LLM: " 1 ", ANTHROPIC_API_KEY: "", ANTHROPIC_MODEL: "" })).toBeInstanceOf(
      MockLlmClient,
    );
  });

  it("chave só com espaços conta como ausente", () => {
    expect(() => createLlmClient({ ANTHROPIC_API_KEY: "   ", ANTHROPIC_MODEL: "modelo-x" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("getHealth", () => {
  const secretEnv = {
    BRIEFLY_MOCK_LLM: "1",
    ANTHROPIC_API_KEY: "valor-secreto-de-teste",
    ANTHROPIC_MODEL: "modelo-secreto-de-teste",
    VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
  };

  it("retorna só booleanos e o commit curto", () => {
    expect(getHealth(secretEnv)).toEqual({ ok: true, mock: true, hasApiKey: true, hasModel: true, commit: "abcdef1" });
  });

  it("nunca expõe valores das variáveis", () => {
    const json = JSON.stringify(getHealth(secretEnv));
    expect(json).not.toContain("valor-secreto");
    expect(json).not.toContain("modelo-secreto");
  });

  it("indica ausência de configuração", () => {
    expect(getHealth({})).toEqual({ ok: true, mock: false, hasApiKey: false, hasModel: false, commit: null });
  });

  it("GET /api/health responde em runtime com o ambiente atual, sem cache", async () => {
    vi.stubEnv("BRIEFLY_MOCK_LLM", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "valor-secreto-de-teste");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "1234567890abcdef");
    const { GET } = await import("@/app/api/health/route");

    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ ok: true, mock: true, hasApiKey: true, hasModel: false, commit: "1234567" });
    expect(JSON.stringify(body)).not.toContain("valor-secreto");
    vi.unstubAllEnvs();
  });
});
