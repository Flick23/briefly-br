import { generateBrief } from "@/lib/brief-service";
import { PayloadTooLargeError, RateLimitError, ValidationError, toErrorResponse } from "@/lib/errors";
import { createLlmClient } from "@/lib/llm";
import { briefRateLimiter, getClientIp } from "@/lib/rate-limit";
import { BriefRequestSchema } from "@/lib/schemas";

/** Rota só de HTTP: lê o corpo, valida, aplica rate limit, chama o serviço e responde. */

export const maxDuration = 60;

const MAX_BODY_BYTES = 20 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await readBody(request, MAX_BODY_BYTES);

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ValidationError([{ path: "", message: "O corpo precisa ser um JSON válido" }]);
    }

    const parsed = BriefRequestSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      );
    }

    // Antes do rate limit: servidor mal configurado não deve consumir a cota do usuário.
    const llm = createLlmClient();

    const limit = briefRateLimiter.check(getClientIp(request.headers));
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const result = await generateBrief(parsed.data, { llm });
    return Response.json(result, { headers: { "X-RateLimit-Remaining": String(limit.remaining) } });
  } catch (err) {
    const { status, body, headers } = toErrorResponse(err);
    return Response.json(body, { status, headers });
  }
}

/** Lê o corpo como texto, abortando assim que passar do limite (não confia só no Content-Length). */
async function readBody(request: Request, limitBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limitBytes) throw new PayloadTooLargeError(limitBytes);
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError(limitBytes);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
