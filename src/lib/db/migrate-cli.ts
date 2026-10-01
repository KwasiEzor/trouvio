import { getEnv } from "@/lib/env";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

import { createPool } from "./client";
import { runMigrations } from "./migrate";
import { describeTarget } from "./target";

/**
 * pnpm db:migrate : applique les migrations avec le rôle propriétaire du schéma
 * (DATABASE_MIGRATION_URL). Ne cite jamais l'URL : seulement « base locale » ou « base distante ».
 */

export type MigrateCliDeps = {
  readUrl?: () => string;
  migrate?: typeof runMigrations;
  log?: Logger;
};

export async function main({
  readUrl = () => getEnv("databaseMigration").DATABASE_MIGRATION_URL,
  migrate = runMigrations,
  log = defaultLogger,
}: MigrateCliDeps = {}): Promise<number> {
  let url: string;
  try {
    url = readUrl();
  } catch (err) {
    log.error("configuration de la migration invalide", { err });
    return 1;
  }
  const target = describeTarget(url);
  const pool = createPool(url, { applicationName: "trouvio-cli", max: 1 }, log);
  try {
    const { applied } = await migrate(pool);
    const label = applied > 1 ? "migrations appliquées" : "migration appliquée";
    log.info(`${applied} ${label} (${target})`, { applied });
    return 0;
  } catch (err) {
    log.error(`migration échouée (${target})`, { err });
    return 1;
  } finally {
    await pool.end();
  }
}
