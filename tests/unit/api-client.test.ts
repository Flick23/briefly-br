import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, requestBrief } from "@/lib/api-client";
import { makeBrief, REQUEST_FIXTURE } from "../fixtures/data";

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("requestBrief", () => {
  it("envia o corpo como JSON e devolve o resultado", async () => {
    const payload = { brief: makeBrief(), meta: { site: "skipped", pages: [], mock: true } };
    const fetchMock = mockFetch(Response.json(payload));
    await expect(requestBrief(REQUEST_FIXTURE)).resolves.toEqual(payload);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/brief");
    expect(JSON.parse(init.body as string)).toEqual(REQUEST_FIXTURE);
  });

  it("usa a mensagem e os details da API em caso de erro", async () => {
    mockFetch(
      Response.json(
        { error: { code: "invalid_input", message: "Campos inválidos", details: [{ path: "prospect.website", message: "x" }] } },
        { status: 400 },
      ),
    );
    const error = await requestBrief(REQUEST_FIXTURE).catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: "Campos inválidos" });
    expect(error.details).toHaveLength(1);
  });

  it("dá mensagem legível quando a resposta não é JSON (ex.: timeout do gateway)", async () => {
    mockFetch(new Response("<html>Gateway Timeout</html>", { status: 504 }));
    await expect(requestBrief(REQUEST_FIXTURE)).rejects.toMatchObject({ status: 504, message: expect.stringMatching(/demorou demais/) });
  });

  it("trata falha de rede", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(requestBrief(REQUEST_FIXTURE)).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/conexão/) });
  });
});
