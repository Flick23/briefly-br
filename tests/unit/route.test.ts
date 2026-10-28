import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/brief/route";
import { briefRateLimiter } from "@/lib/rate-limit";
import { BriefSchema } from "@/lib/schemas";
import { REQUEST_FIXTURE } from "../fixtures/data";

// Sem site para o teste da rota não depender de rede.
const { website: _site, ...prospect } = REQUEST_FIXTURE.prospect;
const VALID_BODY = { ...REQUEST_FIXTURE, prospect };

function post(body: unknown, ip = "203.0.113.10", raw?: string) {
  return POST(
    new Request("http://localhost/api/brief", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  briefRateLimiter.reset();
  vi.stubEnv("BRIEFLY_MOCK_LLM", "1");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/brief", () => {
  it("200 com o LLM mockado", async () => {
    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(BriefSchema.safeParse(json.brief).success).toBe(true);
    expect(json.meta).toMatchObject({ site: "skipped", mock: true });
    expect(json.brief.confidence).toBe("baixa");
  });

  it("400 com details do Zod para entrada inválida", async () => {
    const res = await post({ offer: { productName: "" }, prospect: {} });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_input");
    expect(json.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "offer.productName" }),
        expect.objectContaining({ path: "prospect.companyName" }),
      ]),
    );
  });

  it("400 para JSON malformado", async () => {
    const res = await post(undefined, undefined, "{nao-e-json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
  });

  it("413 para corpo acima de 20 KB", async () => {
    const res = await post({ ...VALID_BODY, prospect: { ...prospect, notes: "x".repeat(21 * 1024) } });
    expect(res.status).toBe(413);
  });

  it("500 sem chave da API, com log claro", async () => {
    vi.stubEnv("BRIEFLY_MOCK_LLM", "");
    vi.stubEnv("ANTHROPIC_MODEL", "modelo-x");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post(VALID_BODY);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("config_error");
    expect(JSON.stringify(json)).not.toContain("ANTHROPIC_API_KEY");
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY"), expect.anything());
  });

  it("429 depois de 10 briefs na mesma hora para o mesmo IP", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await post(VALID_BODY, "198.51.100.7")).status).toBe(200);
    }
    const blocked = await post(VALID_BODY, "198.51.100.7");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await blocked.json()).error.code).toBe("rate_limited");

    // Outro IP não é afetado.
    expect((await post(VALID_BODY, "198.51.100.8")).status).toBe(200);
  });

  it("entrada inválida não consome a cota do rate limit", async () => {
    for (let i = 0; i < 12; i++) await post({}, "198.51.100.9");
    expect((await post(VALID_BODY, "198.51.100.9")).status).toBe(200);
  });
});
