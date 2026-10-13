import { vi } from "vitest";

import type { ConsumeResult, RateLimiter } from "@/lib/rate-limit/types";

/** Limiteur qui accepte tout : par défaut dans les tests qui ne portent pas sur la limitation. */
export function unlimitedLimiter() {
  return {
    consume: vi.fn<RateLimiter["consume"]>(() =>
      Promise.resolve({ allowed: true, retryAfterSeconds: null }),
    ),
  };
}

/** Limiteur qui rend toujours `result`. */
export function fixedLimiter(result: ConsumeResult) {
  return {
    consume: vi.fn<RateLimiter["consume"]>(() => Promise.resolve(result)),
  };
}
