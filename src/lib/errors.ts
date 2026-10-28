/**
 * Erros tipados da aplicação. Cada classe carrega o status HTTP e uma mensagem
 * segura para o cliente; detalhes internos ficam só no log do servidor.
 */

export type ErrorCode =
  | "invalid_input"
  | "payload_too_large"
  | "rate_limited"
  | "config_error"
  | "provider_error"
  | "internal_error";

export interface IssueDetail {
  path: string;
  message: string;
}

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCode;
  /** Mensagem exibida ao usuário final. */
  abstract readonly publicMessage: string;
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = "invalid_input" as const;
  readonly publicMessage = "Alguns campos estão inválidos. Revise e tente de novo.";
  constructor(readonly details: IssueDetail[]) {
    super("Entrada inválida");
  }
}

export class PayloadTooLargeError extends AppError {
  readonly status = 413;
  readonly code = "payload_too_large" as const;
  readonly publicMessage: string;
  constructor(limitBytes: number) {
    super(`Corpo da requisição acima de ${limitBytes} bytes`);
    this.publicMessage = `A requisição passou do limite de ${Math.round(limitBytes / 1024)} KB. Encurte os textos.`;
  }
}

export class RateLimitError extends AppError {
  readonly status = 429;
  readonly code = "rate_limited" as const;
  readonly publicMessage: string;
  constructor(readonly retryAfterSeconds: number) {
    super("Limite de requisições atingido");
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    this.publicMessage = `Você atingiu o limite de briefs por hora. Tente de novo em ${minutes} min.`;
  }
}

/** Configuração ausente ou inválida no servidor (ex.: chave da API). */
export class ConfigError extends AppError {
  readonly status = 500;
  readonly code = "config_error" as const;
  readonly publicMessage = "O servidor não está configurado corretamente. Avise o administrador.";
}

/** Falha do provedor de IA: indisponível, erro de API ou saída inválida após nova tentativa. */
export class ProviderError extends AppError {
  readonly status = 502;
  readonly code = "provider_error" as const;
  readonly publicMessage = "O serviço de IA falhou ao gerar o brief. Tente de novo em instantes.";
}

export class InternalError extends AppError {
  readonly status = 500;
  readonly code = "internal_error" as const;
  readonly publicMessage = "Erro interno inesperado. Tente de novo.";
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: IssueDetail[] };
}

/** Converte qualquer erro em `{ status, body }`, registrando no log o que for do servidor. */
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody; headers: Record<string, string> } {
  const appError = err instanceof AppError ? err : new InternalError("Erro não tratado", { cause: err });

  if (appError.status >= 500) {
    console.error(`[briefly] ${appError.code}: ${appError.message}`, appError.cause ?? "");
  }

  const headers: Record<string, string> = {};
  if (appError instanceof RateLimitError) {
    headers["Retry-After"] = String(appError.retryAfterSeconds);
  }

  return {
    status: appError.status,
    headers,
    body: {
      error: {
        code: appError.code,
        message: appError.publicMessage,
        ...(appError instanceof ValidationError ? { details: appError.details } : {}),
      },
    },
  };
}
