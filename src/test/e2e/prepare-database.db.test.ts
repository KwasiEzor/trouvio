import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDatabase, createPool } from "@/lib/db/client";
import {
  dropDatabase,
  testDatabaseUrl,
  uniqueDatabaseName,
  withAdmin,
} from "@/test/db/test-database";

import { E2E_DATABASE, e2eDatabaseUrl } from "./environment";
import { prepareE2eDatabase } from "./prepare-database";

const journal = JSON.parse(
  readFileSync(
    new URL("../../../db/migrations/meta/_journal.json", import.meta.url),
    "utf8",
  ),
) as { entries: unknown[] };

/** Nom propre à ce fichier : la vraie base des E2E peut servir en même temps. */
const NOM = uniqueDatabaseName(E2E_DATABASE);

async function surLaBase<T>(
  fn: (db: ReturnType<typeof createDatabase>) => Promise<T>,
): Promise<T> {
  const pool = createPool(testDatabaseUrl(NOM), {
    applicationName: "trouvio-test",
    max: 1,
  });
  try {
    return await fn(createDatabase(pool));
  } finally {
    await pool.end();
  }
}

const compteUtilisateurs = () =>
  surLaBase(async (db) => {
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from users`,
    );
    return rows[0]?.n;
  });

describe("prepareE2eDatabase", () => {
  afterAll(async () => {
    await withAdmin((admin) => dropDatabase(admin, NOM));
  });

  it("crée une base migrée", async () => {
    expect(await prepareE2eDatabase(NOM)).toEqual({
      applied: journal.entries.length,
    });
    expect(await compteUtilisateurs()).toBe(0);
  });

  it("repart d'une base vide à chaque exécution", async () => {
    await surLaBase((db) =>
      db.execute(
        sql`insert into users (name, email) values ('Camille Fictif', 'camille@example.com')`,
      ),
    );
    expect(await compteUtilisateurs()).toBe(1);

    await prepareE2eDatabase(NOM);
    expect(await compteUtilisateurs()).toBe(0);
  });

  // La préparation supprime la base visée : jamais celle du développement.
  it.each(["trouvio_dev", "postgres", "trouvio_e2e; drop database x", ""])(
    "refuse de recréer une base nommée « %s »",
    async (nom) => {
      await expect(prepareE2eDatabase(nom)).rejects.toThrow(
        "Nom de base E2E refusé",
      );
    },
  );
});

describe("e2eDatabaseUrl", () => {
  it("vise la base trouvio_e2e du Postgres de test, en boucle locale", () => {
    const url = new URL(e2eDatabaseUrl());
    expect(url.pathname).toBe("/trouvio_e2e");
    expect(url.host).toBe(new URL(testDatabaseUrl()).host);
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(url.hostname);
  });
});
