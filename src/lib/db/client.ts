import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { logger as defaultLogger, type Logger } from "@/lib/logger";

import * as schema from "../../../db/schema";

/**
 * Accès Postgres par node-postgres (ADR 0002). Aucune connexion n'est ouverte avant la première
 * requête. L'URL vient de src/lib/env.ts, jamais d'ici.
 */

export type Database = NodePgDatabase<typeof schema>;
export type ApplicationName =
  "trouvio-web" | "trouvio-job" | "trouvio-cli" | "trouvio-test";

export function createPool(
  url: string,
  {
    applicationName,
    max = 10,
  }: { applicationName: ApplicationName; max?: number },
  log: Logger = defaultLogger,
): Pool {
  const pool = new Pool({
    connectionString: url,
    application_name: applicationName,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  // Sans ce gestionnaire, une connexion inactive coupée par le serveur (Neon coupe les
  // connexions inactives) émettrait une erreur non gérée et ferait tomber le processus.
  pool.on("error", (err) => {
    log.error("connexion inactive à la base perdue", { source: "db", err });
  });
  return pool;
}

export function createDatabase(pool: Pool): Database {
  return drizzle({ client: pool, schema });
}
