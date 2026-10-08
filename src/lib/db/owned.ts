import { eq, sql, type SQL } from "drizzle-orm";

import type { UserId } from "@/lib/auth/access";

import {
  applications,
  deliveries,
  offerFeedback,
  offerScores,
  searchProfiles,
} from "../../../db/schema";

/**
 * Tables possédées par un utilisateur (P1-03, ADR 0014). Toute requête du code applicatif sur
 * l'une d'elles passe par ownedBy, jointures comprises. Le registre est tenu à jour par un test de
 * parité (src/lib/db/schema.test.ts) et chaque table reçoit sa matrice IDOR
 * (src/lib/db/owned.db.test.ts, kit src/test/db/tenants.ts).
 *
 * Usage :
 * - lecture, modification, suppression : `where(ownedBy(t, userId, eq(t.id, id)))` ;
 * - jointure : `leftJoin(t, and(eq(t.offerId, jobOffers.id), ownedBy(t, userId)))` ;
 * - insertion : `values({ ...input, userId })` ; jamais userId dans un `set`.
 */
export const USER_OWNED_TABLES = {
  search_profiles: searchProfiles,
  offer_scores: offerScores,
  offer_feedback: offerFeedback,
  applications,
  deliveries,
} as const;

export type UserOwnedTableName = keyof typeof USER_OWNED_TABLES;
export type UserOwnedTable = (typeof USER_OWNED_TABLES)[UserOwnedTableName];

/** Gérées par Better Auth seul : jamais requêtées par le code applicatif. */
export const AUTH_OWNED_TABLES = ["sessions", "accounts"] as const;

/** Prédicat de portée : le filtre user_id est toujours présent, quelles que soient les conditions en plus. */
export function ownedBy(
  table: UserOwnedTable,
  userId: UserId,
  ...extra: (SQL | undefined)[]
): SQL {
  const conditions = [
    eq(table.userId, userId),
    ...extra.filter((condition) => condition !== undefined),
  ];
  // Comme and(), sans son cas « aucune condition » (undefined) : eq() est toujours là.
  return sql`(${sql.join(conditions, sql` and `)})`;
}
