import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { createPool } from "@/lib/db/client";

import { testDatabaseUrl } from "./url";

export { testDatabaseUrl };

/**
 * Administration du Postgres de test (Docker local ou service de la CI) : créer et supprimer des
 * bases. Sans dépendance à Vitest : sert aussi à préparer la base des E2E (src/test/e2e).
 */

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
