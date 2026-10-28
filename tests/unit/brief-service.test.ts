import { describe, expect, it, vi } from "vitest";

import { generateBrief } from "@/lib/brief-service";
import { ConfigError, ProviderError } from "@/lib/errors";
import { AnthropicLlmClient, createLlmClient, MockLlmClient, type LlmClient, type LlmRequest } from "@/lib/llm";
import { BriefRequestSchema, BriefSchema } from "@/lib/schemas";
import type { SiteContent } from "@/lib/site-fetcher";
import Anthropic from "@anthropic-ai/sdk";
import { makeBrief, REQUEST_FIXTURE } from "../fixtures/data";

const input = BriefRequestSchema.parse(REQUEST_FIXTURE);
const PAGE_URL = "https://valeazul.example/";
const siteOk = async (): Promise<SiteContent> => ({ status: "ok", pages: [{ url: PAGE_URL, text: "Texto do site." }] });
const siteFailed = async (): Promise<SiteContent> => ({ status: "failed", pages: [], failureReason: "timeout" });

/** LLM falso que devolve as respostas na ordem e registra as chamadas. */
function fakeLlm(...responses: (string | Error)[]): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    mock: false,
    calls,
    async generate(request) {
      calls.push(request);
      const next = responses.shift();
      if (next === undefined) throw new Error("sem resposta configurada");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe("generateBrief", () => {
  it("gera o brief com sucesso e devolve metadados do site", async () => {
    const llm = fakeLlm(JSON.stringify(makeBrief({ sources: [{ claim: "Fato do site", url: PAGE_URL }] })));
    const result = await generateBrief(input, { llm, fetchSite: siteOk });

    expect(result.brief.confidence).toBe("alta");
    expect(result.brief.sources).toEqual([{ claim: "Fato do site", url: PAGE_URL }]);
    expect(result.meta).toEqual({ site: "ok", pages: [PAGE_URL], mock: false });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].user).toContain("Texto do site.");
    expect(llm.calls[0].system).toContain("português do Brasil");
  });

  it("descarta fontes que não vieram da entrada nem de páginas buscadas", async () => {
    const llm = fakeLlm(
      JSON.stringify(
        makeBrief({
          sources: [
            { claim: "Da entrada", url: "input" },
            { claim: "Inventada", url: "https://outro-site.example/noticia" },
            { claim: "Do site", url: PAGE_URL },
          ],
        }),
      ),
    );
    const result = await generateBrief(input, { llm, fetchSite: siteOk });
    expect(result.brief.sources.map((source) => source.claim)).toEqual(["Da entrada", "Do site"]);
  });

  it("força confiança baixa quando o site falha, sem tratar como erro", async () => {
    const llm = fakeLlm(JSON.stringify(makeBrief({ confidence: "alta" })));
    const result = await generateBrief(input, { llm, fetchSite: siteFailed });
    expect(result.brief.confidence).toBe("baixa");
    expect(result.meta).toMatchObject({ site: "failed", siteError: "timeout" });
  });

  it("faz uma nova tentativa quando a saída é inválida, enviando o erro de volta", async () => {
    const invalid = JSON.stringify({ ...makeBrief(), hooks: ["só um"] });
    const llm = fakeLlm(invalid, JSON.stringify(makeBrief()));
    const result = await generateBrief(input, { llm, fetchSite: siteOk });

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].user).toMatch(/não passou na validação: hooks/);
    expect(BriefSchema.safeParse(result.brief).success).toBe(true);
  });

  it("retorna ProviderError após duas saídas inválidas", async () => {
    const llm = fakeLlm("não é json", JSON.stringify({ summary: "incompleto" }));
    await expect(generateBrief(input, { llm, fetchSite: siteOk })).rejects.toBeInstanceOf(ProviderError);
    expect(llm.calls).toHaveLength(2);
  });

  it("propaga falha do provedor sem nova tentativa", async () => {
    const llm = fakeLlm(new ProviderError("API fora do ar"));
    await expect(generateBrief(input, { llm, fetchSite: siteOk })).rejects.toBeInstanceOf(ProviderError);
    expect(llm.calls).toHaveLength(1);
  });
});

describe("createLlmClient", () => {
  it("usa o mock com BRIEFLY_MOCK_LLM=1, sem exigir chave", () => {
    expect(createLlmClient({ BRIEFLY_MOCK_LLM: "1" })).toBeInstanceOf(MockLlmClient);
  });

  it("exige ANTHROPIC_API_KEY e ANTHROPIC_MODEL fora do modo mock", () => {
    expect(() => createLlmClient({ ANTHROPIC_MODEL: "modelo-x" })).toThrow(ConfigError);
    expect(() => createLlmClient({ ANTHROPIC_API_KEY: "chave-falsa" })).toThrow(ConfigError);
    expect(createLlmClient({ ANTHROPIC_API_KEY: "chave-falsa", ANTHROPIC_MODEL: "modelo-x" })).toBeInstanceOf(
      AnthropicLlmClient,
    );
  });
});

describe("AnthropicLlmClient", () => {
  const request: LlmRequest = { system: "s", user: "u", context: { input, pages: [] } };

  function clientThatThrows(error: unknown) {
    const create = vi.fn().mockRejectedValue(error);
    return new AnthropicLlmClient({ messages: { create } } as unknown as Anthropic, "modelo-do-ambiente");
  }

  it("usa o modelo do ambiente e saída estruturada", async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"ok":true}' }],
    });
    const client = new AnthropicLlmClient({ messages: { create } } as unknown as Anthropic, "modelo-do-ambiente");
    await expect(client.generate(request)).resolves.toBe('{"ok":true}');
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("modelo-do-ambiente");
    expect(params.output_config.format.type).toBe("json_schema");
  });

  it("converte erro de conexão e 5xx em ProviderError", async () => {
    await expect(clientThatThrows(new Anthropic.APIConnectionError({ message: "offline" })).generate(request)).rejects.toBeInstanceOf(ProviderError);
    await expect(
      clientThatThrows(Anthropic.APIError.generate(529, {}, "overloaded", new Headers())).generate(request),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("converte chave inválida e modelo inexistente em ConfigError", async () => {
    await expect(
      clientThatThrows(Anthropic.APIError.generate(401, {}, "invalid x-api-key", new Headers())).generate(request),
    ).rejects.toBeInstanceOf(ConfigError);
    await expect(
      clientThatThrows(Anthropic.APIError.generate(404, {}, "model not found", new Headers())).generate(request),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("trata recusa do modelo como ProviderError", async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: "refusal", content: [] });
    const client = new AnthropicLlmClient({ messages: { create } } as unknown as Anthropic, "m");
    await expect(client.generate(request)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("MockLlmClient", () => {
  it("gera um brief válido usando só dados da entrada", async () => {
    const raw = await new MockLlmClient().generate({ system: "", user: "", context: { input, pages: [] } });
    const brief = BriefSchema.parse(JSON.parse(raw));
    expect(brief.confidence).toBe("baixa");
    expect(brief.sources.every((source) => source.url === "input")).toBe(true);
    expect(brief.microScript).toContain(input.offer.productName);
  });
});
