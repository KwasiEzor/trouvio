import { asc, inArray, lt, sql } from "drizzle-orm";

import type {
  ConsumeResult,
  RateLimitEntry,
  RateLimitStore,
} from "@/lib/rate-limit/types";

import { rateLimits } from "../../../db/schema";
import type { Database } from "./client";

/**
 * Magasin Postgres des compteurs de limitation (ADR 0015) : un seul upsert atomique par appel,
 * toutes règles comprises. Les clés sont triées : deux appels concurrents verrouillent les mêmes
 * lignes dans le même ordre, sans interblocage. Les clés d'un appel sont distinctes (la fenêtre
 * fait partie de la clé), condition d'un ON CONFLICT sur plusieurs lignes.
 */
export function createPgRateLimitStore(db: Database): RateLimitStore {
  return {
    async consume(entries, now) {
      // Ordre des octets, indépendant de la locale : le même dans toutes les instances.
      const sorted = [...entries].sort((a, b) =>
        Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)),
      );
      const expired = sql`${rateLimits.expiresAt} <= ${now.toISOString()}::timestamptz`;
      const rows = await db
        .insert(rateLimits)
        .values(
          sorted.map(({ key, rule }) => ({
            key,
            count: 1,
            expiresAt: new Date(now.getTime() + rule.windowSeconds * 1000),
          })),
        )
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
            expiresAt: sql`case when ${expired} then excluded.expires_at else ${rateLimits.expiresAt} end`,
          },
        })
        .returning();
      const byKey = new Map(rows.map((row) => [row.key, row]));
      return entries.map((entry) => decide(entry, byKey.get(entry.key), now));
    },

    async purgeExpired(now, batchSize) {
      // SKIP LOCKED : la purge ne bloque jamais une requête qui consomme le même compteur.
      const batch = db
        .select({ key: rateLimits.key })
        .from(rateLimits)
        .where(lt(rateLimits.expiresAt, now))
        .orderBy(asc(rateLimits.expiresAt))
        .limit(batchSize)
        .for("update", { skipLocked: true });
      const deleted = await db
        .delete(rateLimits)
        .where(inArray(rateLimits.key, batch))
        .returning({ key: rateLimits.key });
      return deleted.length;
    },
  };
}

function decide(
  { rule }: RateLimitEntry,
  row: { count: number; expiresAt: Date } | undefined,
  now: Date,
): ConsumeResult {
  if (row === undefined) throw new Error("compteur de limitation absent");
  if (row.count <= rule.max) return { allowed: true, retryAfterSeconds: null };
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil(
      (row.expiresAt.getTime() - now.getTime()) / 1000,
    ),
  };
}
