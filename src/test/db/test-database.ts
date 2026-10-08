import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { inject } from "vitest";

import { createDatabase, createPool, type Database } from "@/lib/db/client";

import {
  createEmptyDatabase,
  dropDatabase,
  testDatabaseUrl,
  withAdmin,
} from "./admin";

export { createEmptyDatabase, dropDatabase, testDatabaseUrl, withAdmin };

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

/** Vide toutes les tables (les tables dépendantes suivent par cascade). */
export async function resetData(db: Database): Promise<void> {
  await db.execute(
    sql`truncate users, job_offers, job_runs, verifications cascade`,
  );
}
