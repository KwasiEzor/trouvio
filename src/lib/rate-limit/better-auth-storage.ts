import type { BetterAuthOptions } from "better-auth";

import { OTHER_PATH_BUCKET, RATE_LIMITED_PATHS } from "./rules";
import type { RateLimiter } from "./types";

type BetterAuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

/**
 * Branche le limiteur sur Better Auth (`rateLimit.customStorage`). Better Auth passe la clé
 * « ip|chemin » ; tout chemin hors de RATE_LIMITED_PATHS est ramené à un seau commun par IP.
 */
export function toBetterAuthStorage(
  limiter: RateLimiter,
): BetterAuthRateLimitStorage {
  return {
    async consume(key, rule) {
      // Une IP ne contient jamais « | » ; le chemin, lui, peut en contenir.
      const separator = key.indexOf("|");
      const ip = key.slice(0, separator);
      const path = key.slice(separator + 1);
      const bucket = RATE_LIMITED_PATHS.includes(path)
        ? path
        : OTHER_PATH_BUCKET;
      const result = await limiter.consume("auth-ip", `${ip}|${bucket}`, [
        { windowSeconds: rule.window, max: rule.max },
      ]);
      return { allowed: result.allowed, retryAfter: result.retryAfterSeconds };
    },
  };
}
