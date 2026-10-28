import type { ErrorBody, IssueDetail } from "@/lib/errors";
import type { BriefRequestInput, BriefResponse } from "@/lib/schemas";

/** Erro da chamada à API, com mensagem pronta para exibir ao usuário. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: IssueDetail[],
  ) {
    super(message);
  }
}

function fallbackMessage(status: number): string {
  if (status === 504) return "O servidor demorou demais para responder. Tente de novo.";
  if (status === 401 || status === 403) return "Acesso negado pelo servidor.";
  if (status === 404) return "Endpoint da API não encontrado.";
  return `Erro inesperado do servidor (HTTP ${status}). Tente de novo.`;
}

export async function requestBrief(body: BriefRequestInput, signal?: AbortSignal): Promise<BriefResponse> {
  let response: Response;
  try {
    response = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Não foi possível falar com o servidor. Verifique sua conexão.", 0);
  }

  const data = (await response.json().catch(() => null)) as (Partial<BriefResponse> & Partial<ErrorBody>) | null;

  if (!response.ok) {
    throw new ApiError(data?.error?.message ?? fallbackMessage(response.status), response.status, data?.error?.details);
  }
  if (!data?.brief || !data.meta) {
    throw new ApiError("O servidor respondeu em um formato inesperado.", response.status);
  }
  return data as BriefResponse;
}
