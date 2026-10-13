import type { Logger } from "@/lib/logger";
import { createLogThrottle } from "@/lib/logger/throttle";

import { rateLimitKey } from "./keys";
import type {
  ConsumeResult,
  RateLimiter,
  RateLimitRule,
  RateLimitScope,
  RateLimitStore,
} from "./types";

const PURGE_BATCH_SIZE = 1000;
const LIMIT_LOG_WINDOW_MS = 10 * 60 * 1000;

/**
 * Limiteur générique : toutes les règles d'un appel en une seule opération du magasin. Une panne du
 * magasin remonte (échec fermé) ; une purge en échec est seulement journalisée.
 */
export function createRateLimiter({
  store,
  secret,
  log,
  now = () => new Date(),
  purgeEvery = 100,
}: {
  store: RateLimitStore;
  secret: string;
  log: Logger;
  now?: () => Date;
  purgeEvery?: number;
}): RateLimiter {
  let calls = 0;
  // Par portée seulement : ni IP ni email dans les journaux.
  const throttle = createLogThrottle({
    windowMs: LIMIT_LOG_WINDOW_MS,
    maxKeys: 10,
    now: () => now().getTime(),
  });

  async function purge(at: Date): Promise<void> {
    try {
      await store.purgeExpired(at, PURGE_BATCH_SIZE);
    } catch (err) {
      log.warn("purge des compteurs de limitation en échec", { err });
    }
  }

  return {
    async consume(
      scope: RateLimitScope,
      subject: string,
      rules: readonly RateLimitRule[],
    ): Promise<ConsumeResult> {
      // La fenêtre fait partie de la clé : deux règles de même fenêtre partageraient un compteur.
      if (
        new Set(rules.map((rule) => rule.windowSeconds)).size !== rules.length
      ) {
        throw new Error("deux règles de limitation ont la même fenêtre");
      }
      const at = now();
      const results = await store.consume(
        rules.map((rule) => ({
          key: rateLimitKey(secret, scope, rule, subject),
          rule,
        })),
        at,
      );
      calls += 1;
      if (calls % purgeEvery === 0) await purge(at);

      const refused = results.filter((result) => !result.allowed);
      if (refused.length === 0)
        return { allowed: true, retryAfterSeconds: null };
      const { log: shouldLog, suppressed } = throttle(scope);
      if (shouldLog)
        log.warn("limite de débit atteinte", { scope, suppressed });
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          ...refused.map((result) => result.retryAfterSeconds ?? 0),
        ),
      };
    },
  };
}
