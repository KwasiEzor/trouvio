import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { inject } from "vitest";

import { createDatabase, createPool, type Database } from "@/lib/db/client";
import { getEnv } from "@/lib/env";

/**
 * Bases des tests d'intégration (projet Vitest « db ») sur le Postgres Docker local
 * (pnpm db:local:up) ou le service Postgres de la CI. Chaque fichier de test travaille sur sa
 * propre base, clonée de la base modèle migrée par global-setup.ts, puis supprimée.
 */

declare module "vitest" {
  export interface ProvidedContext {
    templateDatabase: string;
  }
}

export function uniqueDatabaseName(prefix: string): string {
  return `${prefix}_${process.pid}_${randomBytes(4).toString("hex")}`;
}

/** URL de la base de test, sur la base nommée (base d'administration par défaut). */
export function testDatabaseUrl(database?: string): string {
  const url = new URL(getEnv("testDatabase").TEST_DATABASE_URL);
  if (database) url.pathname = `/${database}`;
  return url.toString();
}

/** Ouvre la base d'administration, vérifie qu'elle répond, exécute fn, puis ferme. */
export async function withAdmin<T>(
  fn: (admin: Pool) => Promise<T>,
): Promise<T> {
  const admin = createPool(testDatabaseUrl(), {
    applicationName: "trouvio-test",
    max: 1,
  });
  try {
    try {
      await admin.query("select 1");
    } catch (cause) {
      const { host } = new URL(testDatabaseUrl());
      throw new Error(
        `Base de test injoignable sur ${host} : lance \`pnpm db:local:up\` dans ton terminal.`,
        { cause },
      );
    }
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

export async function createEmptyDatabase(
  admin: Pool,
  name: string,
  template?: string,
): Promise<void> {
  const db = drizzle({ client: admin });
  await db.execute(
    template
      ? sql`create database ${sql.identifier(name)} template ${sql.identifier(template)}`
      : sql`create database ${sql.identifier(name)}`,
  );
}

export async function dropDatabase(admin: Pool, name: string): Promise<void> {
  await drizzle({ client: admin }).execute(
    sql`drop database if exists ${sql.identifier(name)} with (force)`,
  );
}

export type TestDatabase = {
  pool: Pool;
  db: Database;
  close(): Promise<void>;
};

/** Base propre au fichier de test : migrée (clone du modèle) ou vierge. */
export async function openTestDatabase({
  migrated,
}: {
  migrated: boolean;
}): Promise<TestDatabase> {
  const name = uniqueDatabaseName("trouvio_test");
  await withAdmin((admin) =>
    createEmptyDatabase(
      admin,
      name,
      migrated ? inject("templateDatabase") : undefined,
    ),
  );
  const pool = createPool(testDatabaseUrl(name), {
    applicationName: "trouvio-test",
    max: 2,
  });
  return {
    pool,
    db: createDatabase(pool),
    async close() {
      await pool.end();
      await withAdmin((admin) => dropDatabase(admin, name));
    },
  };
}

/** Vide toutes les tables métier (les tables dépendantes suivent par cascade). */
export async function resetData(db: Database): Promise<void> {
  await db.execute(sql`truncate users, job_offers, job_runs cascade`);
}
