import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";

import {
  applications,
  deliveries,
  jobOffers,
  offerFeedback,
  offerScores,
  searchProfiles,
  users,
  type NewJobOffer,
} from "../../../db/schema";

let t: TestDatabase;

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await resetData(t.db);
});

type PgFailure = { code?: string; constraint?: string };

/** Erreur Postgres levée par la requête (drizzle l'enveloppe dans cause). */
async function pgFailure(query: PromiseLike<unknown>): Promise<PgFailure> {
  try {
    await query;
  } catch (error) {
    const pg = (error instanceof Error && error.cause) || error;
    return pg as PgFailure;
  }
  throw new Error("la requête aurait dû échouer");
}

async function makeUser(email = `${randomUUID()}@example.com`) {
  const [user] = await t.db
    .insert(users)
    .values({ email, name: "Camille Durand" })
    .returning({ id: users.id });
  if (!user) throw new Error("utilisateur non créé");
  return user.id;
}

async function makeOffer(overrides: Partial<NewJobOffer> = {}) {
  const [offer] = await t.db
    .insert(jobOffers)
    .values({
      source: "adzuna",
      externalId: randomUUID(),
      dedupHash: "a".repeat(64),
      title: "Développeur TypeScript",
      url: "https://offres.example/1",
      raw: {},
      ...overrides,
    })
    .returning({ id: jobOffers.id });
  if (!offer) throw new Error("offre non créée");
  return offer.id;
}

describe("idempotence", () => {
  it("refuse une offre en double pour une même source", async () => {
    await makeOffer({ externalId: "42" });
    expect(await pgFailure(makeOffer({ externalId: "42" }))).toMatchObject({
      code: "23505",
      constraint: "job_offers_source_external_id_unique",
    });
  });

  it("accepte le même identifiant externe sur une autre source", async () => {
    await makeOffer({ externalId: "42", source: "adzuna" });
    await expect(
      makeOffer({ externalId: "42", source: "forem" }),
    ).resolves.toBeTruthy();
  });

  it("ignore un second score du même utilisateur pour la même offre", async () => {
    const userId = await makeUser();
    const offerId = await makeOffer();
    const score = {
      userId,
      offerId,
      score: 80,
      status: "scored" as const,
      model: "claude-haiku-4-5-20251001",
      promptVersion: "v1",
    };
    await t.db.insert(offerScores).values(score);
    const second = await t.db
      .insert(offerScores)
      .values({ ...score, score: 10 })
      .onConflictDoNothing()
      .returning();
    expect(second).toEqual([]);
  });

  it("refuse deux envois du même digest sur le même canal", async () => {
    const userId = await makeUser();
    const delivery = {
      userId,
      channel: "telegram" as const,
      digestDate: "2026-10-01",
    };
    await t.db.insert(deliveries).values(delivery);
    expect(
      await pgFailure(t.db.insert(deliveries).values(delivery)),
    ).toMatchObject({
      code: "23505",
      constraint: "deliveries_user_id_channel_digest_date_unique",
    });
  });
});

describe("contraintes de validité", () => {
  it("refuse un seuil hors de 0 à 100", async () => {
    const userId = await makeUser();
    expect(
      await pgFailure(
        t.db
          .insert(searchProfiles)
          .values({ userId, zone: "Namur", threshold: 101 }),
      ),
    ).toMatchObject({
      code: "23514",
      constraint: "search_profiles_threshold_check",
    });
  });

  it("refuse une offre canonique d'elle-même", async () => {
    const offerId = await makeOffer();
    expect(
      await pgFailure(
        t.db
          .update(jobOffers)
          .set({ canonicalOfferId: offerId })
          .where(eq(jobOffers.id, offerId)),
      ),
    ).toMatchObject({
      code: "23514",
      constraint: "job_offers_not_own_canonical_check",
    });
  });

  it("refuse une empreinte de dédoublonnage qui n'est pas un sha256", async () => {
    expect(await pgFailure(makeOffer({ dedupHash: "abc" }))).toMatchObject({
      code: "23514",
      constraint: "job_offers_dedup_hash_check",
    });
  });

  it("refuse une URL d'offre qui n'est pas http(s)", async () => {
    expect(
      await pgFailure(makeOffer({ url: "javascript:alert(1)" })),
    ).toMatchObject({ code: "23514", constraint: "job_offers_url_check" });
  });

  it("refuse une fourchette de salaire inversée", async () => {
    expect(
      await pgFailure(makeOffer({ salaryMin: 50000, salaryMax: 40000 })),
    ).toMatchObject({ code: "23514", constraint: "job_offers_salary_check" });
  });

  it("refuse plus de 10 offres dans un digest", async () => {
    const userId = await makeUser();
    const offerIds = Array.from({ length: 11 }, () => randomUUID());
    expect(
      await pgFailure(
        t.db.insert(deliveries).values({
          userId,
          channel: "email",
          digestDate: "2026-10-01",
          offerIds,
        }),
      ),
    ).toMatchObject({
      code: "23514",
      constraint: "deliveries_offer_ids_check",
    });
  });

  it("refuse un score « scored » sans note", async () => {
    const userId = await makeUser();
    const offerId = await makeOffer();
    expect(
      await pgFailure(
        t.db.insert(offerScores).values({
          userId,
          offerId,
          status: "scored",
          model: "claude-haiku-4-5-20251001",
          promptVersion: "v1",
        }),
      ),
    ).toMatchObject({ code: "23514", constraint: "offer_scores_status_check" });
  });

  it("refuse un email qui n'est pas en minuscules", async () => {
    expect(await pgFailure(makeUser("Camille@Example.com"))).toMatchObject({
      code: "23514",
      constraint: "users_email_lowercase_check",
    });
  });
});

describe("suppressions", () => {
  it("efface toutes les données d'un utilisateur supprimé (RGPD)", async () => {
    const userId = await makeUser();
    const autre = await makeUser();
    const offerId = await makeOffer();
    for (const id of [userId, autre]) {
      await t.db.insert(searchProfiles).values({ userId: id, zone: "Namur" });
      await t.db.insert(offerScores).values({
        userId: id,
        offerId,
        status: "unscored",
        model: "claude-haiku-4-5-20251001",
        promptVersion: "v1",
      });
      await t.db
        .insert(offerFeedback)
        .values({ userId: id, offerId, verdict: "relevant" });
      await t.db.insert(applications).values({ userId: id, offerId });
      await t.db.insert(deliveries).values({
        userId: id,
        channel: "telegram",
        digestDate: "2026-10-01",
        offerIds: [offerId],
      });
    }

    await t.db.delete(users).where(eq(users.id, userId));

    const restes = await t.db.execute<{ table: string; n: number }>(sql`
      select 'search_profiles' as table, count(*)::int as n from search_profiles where user_id = ${userId}
      union all select 'offer_scores', count(*)::int from offer_scores where user_id = ${userId}
      union all select 'offer_feedback', count(*)::int from offer_feedback where user_id = ${userId}
      union all select 'applications', count(*)::int from applications where user_id = ${userId}
      union all select 'deliveries', count(*)::int from deliveries where user_id = ${userId}
      union all select 'autre utilisateur', count(*)::int from search_profiles where user_id = ${autre}
    `);
    expect(restes.rows).toEqual([
      { table: "search_profiles", n: 0 },
      { table: "offer_scores", n: 0 },
      { table: "offer_feedback", n: 0 },
      { table: "applications", n: 0 },
      { table: "deliveries", n: 0 },
      { table: "autre utilisateur", n: 1 },
    ]);
  });

  it("refuse de supprimer une offre liée à une candidature", async () => {
    const userId = await makeUser();
    const offerId = await makeOffer();
    await t.db.insert(applications).values({ userId, offerId });
    expect(
      await pgFailure(t.db.delete(jobOffers).where(eq(jobOffers.id, offerId))),
    ).toMatchObject({
      code: "23503",
      constraint: "applications_offer_id_job_offers_id_fk",
    });
  });

  it("remet à null les doublons d'une offre canonique supprimée", async () => {
    const canonique = await makeOffer({ source: "france-travail" });
    const doublon = await makeOffer({
      source: "adzuna",
      canonicalOfferId: canonique,
    });
    await t.db.delete(jobOffers).where(eq(jobOffers.id, canonique));
    const [row] = await t.db
      .select({ canonicalOfferId: jobOffers.canonicalOfferId })
      .from(jobOffers)
      .where(eq(jobOffers.id, doublon));
    expect(row).toEqual({ canonicalOfferId: null });
  });
});
