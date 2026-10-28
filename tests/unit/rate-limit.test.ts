import { describe, expect, it } from "vitest";

import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("libera de novo quando a janela desliza", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
    expect(limiter.check("a").allowed).toBe(true);
    now = 500;
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    now = 1_001;
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("usa o primeiro IP de x-forwarded-for", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1");
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.2" }))).toBe("203.0.113.2");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
