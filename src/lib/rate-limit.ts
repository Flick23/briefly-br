/**
 * Rate limit em memória, janela deslizante por chave (IP).
 * Limitação conhecida: em serverless cada instância tem a própria memória, então o
 * limite é por instância. Para produção com tráfego real, troque por um store
 * compartilhado (ex.: Redis) mantendo a mesma interface.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** `limit` sobrescreve o limite padrão do limiter nesta checagem. */
  check(key: string, limit?: number): RateLimitResult;
  reset(): void;
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, limitOverride) {
      const max = limitOverride ?? limit;
      const current = now();
      const windowStart = current - windowMs;
      const recent = (hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

      if (recent.length >= max) {
        hits.set(key, recent);
        const retryAfterMs = recent[0] + windowMs - current;
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }

      recent.push(current);
      hits.set(key, recent);

      // Limpeza oportunista para o Map não crescer sem limite.
      if (hits.size > 10_000) {
        for (const [entry, timestamps] of hits) {
          if (!timestamps.some((timestamp) => timestamp > windowStart)) hits.delete(entry);
        }
      }

      return { allowed: true, remaining: max - recent.length, retryAfterSeconds: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

export const BRIEF_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;

/** Limiter compartilhado pela rota de briefs: 10 por hora por IP (a rota passa o limite lido do ambiente). */
export const briefRateLimiter = createRateLimiter(BRIEF_RATE_LIMIT);

/** IP do cliente. Na Vercel, `x-forwarded-for` é definido pela plataforma. */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
