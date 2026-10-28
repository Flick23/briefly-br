/**
 * Leitura de variáveis de ambiente do servidor, sempre em runtime (nunca no build).
 * Valores são aparados: um espaço ou quebra de linha colado no painel da Vercel
 * não pode mudar o comportamento do app.
 */

export type Env = Record<string, string | undefined>;

const TRUTHY = new Set(["1", "true"]);

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Mock ligado com BRIEFLY_MOCK_LLM = "1" ou "true" (sem diferenciar maiúsculas, com trim). */
export function isMockEnabled(env: Env = process.env): boolean {
  return TRUTHY.has(clean(env.BRIEFLY_MOCK_LLM)?.toLowerCase() ?? "");
}

export function getAnthropicConfig(env: Env = process.env): { apiKey?: string; model?: string } {
  return { apiKey: clean(env.ANTHROPIC_API_KEY), model: clean(env.ANTHROPIC_MODEL) };
}

export const DEFAULT_BRIEFS_PER_HOUR = 10;

/** Limite de briefs por hora por IP. Padrão 10; BRIEFLY_RATE_LIMIT_PER_HOUR só para ambientes de teste. */
export function getRateLimitPerHour(env: Env = process.env): number {
  const parsed = Number.parseInt(clean(env.BRIEFLY_RATE_LIMIT_PER_HOUR) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BRIEFS_PER_HOUR;
}

/** Diagnóstico seguro: só booleanos e o commit curto, nunca valores de variáveis. */
export function getHealth(env: Env = process.env) {
  const { apiKey, model } = getAnthropicConfig(env);
  return {
    ok: true,
    mock: isMockEnabled(env),
    hasApiKey: Boolean(apiKey),
    hasModel: Boolean(model),
    commit: clean(env.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? null,
  };
}
