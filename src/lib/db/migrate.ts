import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

/**
 * Applique les migrations versionnées de db/migrations (générées par pnpm db:generate). Le
 * migrateur de drizzle-orm applique les migrations en attente dans une seule transaction et les
 * journalise dans drizzle.__drizzle_migrations. Utilisé par pnpm db:migrate et par les tests.
 */

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../db/migrations", import.meta.url),
);

export async function runMigrations(
  pool: Pool,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<{ applied: number }> {
  const db = drizzle({ client: pool });
  const before = await countApplied(db);
  await migrate(db, { migrationsFolder });
  return { applied: (await countApplied(db)) - before };
}

async function countApplied(db: ReturnType<typeof drizzle>): Promise<number> {
  const table = await db.execute<{ exists: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (!table.rows[0]?.exists) return 0;
  const count = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
  );
  return count.rows[0]?.n ?? 0;
}
