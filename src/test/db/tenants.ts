import { randomUUID } from "node:crypto";

import { eq, type SQL } from "drizzle-orm";

import type { UserId } from "@/lib/auth/access";
import type { Database } from "@/lib/db/client";
import type { UserOwnedTableName } from "@/lib/db/owned";

import {
  applications,
  deliveries,
  jobOffers,
  offerFeedback,
  offerScores,
  searchProfiles,
  users,
} from "../../../db/schema";

/**
 * Kit IDOR (P1-03, ADR 0014) : deux utilisateurs A et B, chacun avec une ligne dans chaque table
 * du registre (src/lib/db/owned.ts). A est rattaché à l'offre O1, B à l'offre O2. Tout futur dépôt
 * ou route qui lit une table possédée se teste avec ce kit (docs/TESTING.md).
 */

export type Tenant = {
  id: UserId;
  /**
   * Condition qui désigne la ligne du locataire dans chaque table, hors user_id (clé de la
   * ressource telle qu'un client la connaîtrait) ; undefined quand user_id est la seule clé.
   */
  keys: Record<UserOwnedTableName, SQL | undefined>;
};

export type TwoTenants = { a: Tenant; b: Tenant; offers: [string, string] };

type Seeder = (
  db: Database,
  userId: UserId,
  offerId: string,
) => Promise<SQL | undefined>;

// satisfies : une table ajoutée au registre sans seeder fait échouer typecheck.
const SEEDERS = {
  search_profiles: async (db, userId) => {
    await db.insert(searchProfiles).values({ userId, zone: "Liège" });
    return undefined;
  },
  offer_scores: async (db, userId, offerId) => {
    await db.insert(offerScores).values({
      userId,
      offerId,
      score: 72,
      status: "scored",
      model: "claude-haiku-4-5-20251001",
      promptVersion: "v1",
    });
    return eq(offerScores.offerId, offerId);
  },
  offer_feedback: async (db, userId, offerId) => {
    await db
      .insert(offerFeedback)
      .values({ userId, offerId, verdict: "relevant" });
    return eq(offerFeedback.offerId, offerId);
  },
  applications: async (db, userId, offerId) => {
    const [row] = await db
      .insert(applications)
      .values({ userId, offerId, notes: "notes privées" })
      .returning({ id: applications.id });
    if (!row) throw new Error("candidature non créée");
    return eq(applications.id, row.id);
  },
  deliveries: async (db, userId, offerId) => {
    const [row] = await db
      .insert(deliveries)
      .values({
        userId,
        channel: "email",
        digestDate: "2026-10-08",
        offerIds: [offerId],
      })
      .returning({ id: deliveries.id });
    if (!row) throw new Error("envoi non créé");
    return eq(deliveries.id, row.id);
  },
} satisfies Record<UserOwnedTableName, Seeder>;

async function makeOffer(db: Database): Promise<string> {
  const [offer] = await db
    .insert(jobOffers)
    .values({
      source: "adzuna",
      externalId: randomUUID(),
      dedupHash: "b".repeat(64),
      title: "Développeur TypeScript",
      url: "https://offres.example/1",
      raw: {},
    })
    .returning({ id: jobOffers.id });
  if (!offer) throw new Error("offre non créée");
  return offer.id;
}

async function makeTenant(
  db: Database,
  label: string,
  offerId: string,
): Promise<Tenant> {
  const [user] = await db
    .insert(users)
    .values({ email: `${label}@example.com`, name: label, emailVerified: true })
    .returning({ id: users.id });
  if (!user) throw new Error("utilisateur non créé");
  const id = user.id as UserId;
  const entries = await Promise.all(
    Object.entries(SEEDERS).map(
      async ([name, seed]) => [name, await seed(db, id, offerId)] as const,
    ),
  );
  return {
    id,
    keys: Object.fromEntries(entries) as Tenant["keys"],
  };
}

export async function seedTwoTenants(db: Database): Promise<TwoTenants> {
  const offers: [string, string] = [await makeOffer(db), await makeOffer(db)];
  return {
    a: await makeTenant(db, "locataire-a", offers[0]),
    b: await makeTenant(db, "locataire-b", offers[1]),
    offers,
  };
}

/** UserId de test, jamais attribué : un identifiant deviné. */
export function guessedUserId(): UserId {
  return randomUUID() as UserId;
}
