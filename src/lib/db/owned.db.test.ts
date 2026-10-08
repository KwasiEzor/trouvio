import { and, eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resourceIdSchema } from "@/lib/auth/access";
import {
  openTestDatabase,
  resetData,
  type TestDatabase,
} from "@/test/db/test-database";
import {
  guessedUserId,
  seedTwoTenants,
  type TwoTenants,
} from "@/test/db/tenants";

import {
  applications,
  jobOffers,
  offerFeedback,
  offerScores,
} from "../../../db/schema";
import {
  ownedBy,
  USER_OWNED_TABLES,
  type UserOwnedTable,
  type UserOwnedTableName,
} from "./owned";

/**
 * Matrice IDOR (P1-03) : pour chaque table du registre, A ne lit, ne modifie ni ne supprime
 * aucune ligne de B. Lecture, modification et suppression passent par du SQL tagué : Drizzle ne
 * type pas un update générique sur l'union des tables, et c'est le prédicat qui est testé ici.
 */

let t: TestDatabase;
let tenants: TwoTenants;

beforeAll(async () => {
  t = await openTestDatabase({ migrated: true });
});
afterAll(async () => {
  // t reste indéfini si openTestDatabase a échoué (base injoignable) : ne pas masquer son message.
  await t?.close();
});
beforeEach(async () => {
  await resetData(t.db);
  tenants = await seedTwoTenants(t.db);
});

type Row = { user_id: string; created_at: Date };

async function rows(query: SQL): Promise<Row[]> {
  const result = await t.db.execute<Row>(query);
  return result.rows;
}

function selectWhere(table: UserOwnedTable, predicate: SQL) {
  return rows(
    sql`select user_id, created_at from ${table} where ${predicate} order by user_id`,
  );
}

/** Lignes de B relues sans portée : la preuve qu'elles n'ont pas bougé. */
function rowsOfB(table: UserOwnedTable) {
  return selectWhere(table, eq(table.userId, tenants.b.id));
}

const names = Object.keys(USER_OWNED_TABLES) as UserOwnedTableName[];

describe.each(names)("%s", (name) => {
  const table = USER_OWNED_TABLES[name];

  it("ne rend à A que ses propres lignes", async () => {
    const found = await selectWhere(table, ownedBy(table, tenants.a.id));
    expect(found.map((row) => row.user_id)).toEqual([tenants.a.id]);
  });

  it("ne rend à A aucune ligne de B, même avec la clé de la ressource de B", async () => {
    const key = tenants.b.keys[name];
    const found = await selectWhere(table, ownedBy(table, tenants.a.id, key));
    expect(found.filter((row) => row.user_id === tenants.b.id)).toEqual([]);
    if (key !== undefined) expect(found).toEqual([]);
  });

  it("ne modifie aucune ligne de B sous la portée de A", async () => {
    const before = await rowsOfB(table);
    const updated = await rows(
      sql`update ${table} set created_at = now() + interval '1 day'
          where ${ownedBy(table, tenants.a.id, tenants.b.keys[name])} returning user_id, created_at`,
    );
    expect(updated.filter((row) => row.user_id === tenants.b.id)).toEqual([]);
    expect(await rowsOfB(table)).toEqual(before);
  });

  it("ne supprime aucune ligne de B sous la portée de A", async () => {
    const before = await rowsOfB(table);
    const deleted = await rows(
      sql`delete from ${table}
          where ${ownedBy(table, tenants.a.id, tenants.b.keys[name])} returning user_id, created_at`,
    );
    expect(deleted.filter((row) => row.user_id === tenants.b.id)).toEqual([]);
    expect(await rowsOfB(table)).toEqual(before);
  });

  it("ne rend rien à un identifiant d'utilisateur deviné", async () => {
    expect(await selectWhere(table, ownedBy(table, guessedUserId()))).toEqual(
      [],
    );
  });

  it("reste scopé quand la condition en plus est absente", async () => {
    const found = await selectWhere(
      table,
      ownedBy(table, tenants.a.id, undefined),
    );
    expect(found.map((row) => row.user_id)).toEqual([tenants.a.id]);
  });
});

describe("identifiant de ressource mal formé", () => {
  it("est refusé avant la base", () => {
    expect(resourceIdSchema.safeParse("' or 1=1 --").success).toBe(false);
  });

  it("ne rend aucune ligne s'il atteint tout de même la base (22P02)", async () => {
    const query = t.db
      .select()
      .from(applications)
      .where(
        ownedBy(applications, tenants.a.id, eq(applications.id, "' or 1=1 --")),
      );
    const failure = await query.then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.cause : error),
    );
    expect(failure).toMatchObject({ code: "22P02" });
  });
});

describe("jointure entre tables possédées", () => {
  it("ne montre jamais à A le verdict de B sur la même offre", async () => {
    const [o1] = tenants.offers;
    await t.db
      .insert(offerFeedback)
      .values({ userId: tenants.b.id, offerId: o1, verdict: "not_relevant" });

    const feed = await t.db
      .select({ offerId: jobOffers.id, verdict: offerFeedback.verdict })
      .from(offerScores)
      .innerJoin(jobOffers, eq(jobOffers.id, offerScores.offerId))
      .leftJoin(
        offerFeedback,
        and(
          eq(offerFeedback.offerId, jobOffers.id),
          ownedBy(offerFeedback, tenants.a.id),
        ),
      )
      .where(ownedBy(offerScores, tenants.a.id));

    expect(feed).toEqual([{ offerId: o1, verdict: "relevant" }]);
  });
});
