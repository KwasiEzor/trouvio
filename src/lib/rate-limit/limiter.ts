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
 *
 * Cache négatif en mémoire : une clé refusée reste refusée jusqu'à la fin de sa fenêtre sans écrire
 * en base (fenêtre fixe : un refus ne la réarme pas). Un flot de requêtes refusées ne sature donc
 * ni le pool ni une ligne chaude de Postgres.
 */
export function createRateLimiter({
  store,
  secret,
  log,
  now = () => new Date(),
  purgeEvery = 100,
  refusedCacheMaxKeys = 10_000,
}: {
  store: RateLimitStore;
  secret: string;
  log: Logger;
  now?: () => Date;
  purgeEvery?: number;
  refusedCacheMaxKeys?: number;
}): RateLimiter {
  let calls = 0;
  // Clé → fin de la fenêtre refusée (ms), plus ancienne d'abord.
  const refusedUntil = new Map<string, number>();
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

  function remember(key: string, until: number): void {
    refusedUntil.delete(key);
    if (refusedUntil.size >= refusedCacheMaxKeys) {
      const oldest = refusedUntil.keys().next();
      if (oldest.done !== true) refusedUntil.delete(oldest.value);
    }
    refusedUntil.set(key, until);
  }

  function refuse(scope: RateLimitScope, retryAfterSeconds: number) {
    const { log: shouldLog, suppressed } = throttle(scope);
    if (shouldLog) {
      log.warn("limite de débit atteinte", {
        scope,
        ...(suppressed > 0 ? { suppressed } : {}),
      });
    }
    return { allowed: false, retryAfterSeconds };
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
      const time = at.getTime();
      const entries = rules.map((rule) => ({
        key: rateLimitKey(secret, scope, rule, subject),
        rule,
      }));
      const cached = entries
        .map((entry) => refusedUntil.get(entry.key) ?? 0)
        .filter((until) => until > time);
      if (cached.length > 0) {
        return refuse(scope, Math.ceil((Math.max(...cached) - time) / 1000));
      }

      const results = await store.consume(entries, at);
      calls += 1;
      if (calls % purgeEvery === 0) await purge(at);

      let retryAfterSeconds = 0;
      entries.forEach((entry, i) => {
        const result = results[i];
        if (result?.allowed !== false) return;
        const seconds = result.retryAfterSeconds ?? 0;
        remember(entry.key, time + seconds * 1000);
        retryAfterSeconds = Math.max(retryAfterSeconds, seconds);
      });
      if (results.every((result) => result.allowed)) {
        return { allowed: true, retryAfterSeconds: null };
      }
      return refuse(scope, retryAfterSeconds);
    },
  };
}
