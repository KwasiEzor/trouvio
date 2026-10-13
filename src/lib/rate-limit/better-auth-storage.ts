import type { BetterAuthOptions } from "better-auth";

import type { Logger } from "@/lib/logger";
import { createLogThrottle } from "@/lib/logger/throttle";

import {
  AUTH_IP_DEFAULT_RULE,
  OTHER_PATH_BUCKET,
  RATE_LIMITED_PATHS,
} from "./rules";
import type { RateLimiter } from "./types";

type BetterAuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

// Clé de Better Auth quand aucune IP n'est résolue (production) : tout le monde partage le compteur.
const NO_TRUSTED_IP = "no-trusted-ip";

/**
 * Branche le limiteur sur Better Auth (`rateLimit.customStorage`). Better Auth passe la clé
 * « ip|chemin » ; tout chemin hors de RATE_LIMITED_PATHS est ramené à un seau commun par IP, sous
 * la règle par défaut (sinon deux règles de même fenêtre s'y partageraient un compteur).
 */
export function toBetterAuthStorage(
  limiter: RateLimiter,
  log: Logger,
): BetterAuthRateLimitStorage {
  const throttle = createLogThrottle({ windowMs: 10 * 60 * 1000, maxKeys: 1 });
  return {
    async consume(key, rule) {
      // Une IP ne contient jamais « | » ; le chemin, lui, peut en contenir.
      const separator = key.indexOf("|");
      if (separator === -1) {
        throw new Error("format de clé du limiteur de Better Auth inattendu");
      }
      const ip = key.slice(0, separator);
      const path = key.slice(separator + 1);
      // Reverse proxy mal configuré (ADR 0015) : signalé à Sentry, une fois par fenêtre.
      if (ip === NO_TRUSTED_IP && throttle(NO_TRUSTED_IP).log) {
        log.error(
          "limiteur : IP du client non résolue, compteur commun à tous",
        );
      }
      const named = RATE_LIMITED_PATHS.includes(path);
      const result = await limiter.consume(
        "auth-ip",
        `${ip}|${named ? path : OTHER_PATH_BUCKET}`,
        [
          named
            ? { windowSeconds: rule.window, max: rule.max }
            : AUTH_IP_DEFAULT_RULE,
        ],
      );
      return { allowed: result.allowed, retryAfter: result.retryAfterSeconds };
    },
  };
}
