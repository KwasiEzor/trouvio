import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "@/lib/env";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

import * as schema from "../../../db/schema";

/**
 * Accès Postgres par node-postgres (ADR 0002). Aucune connexion n'est ouverte avant la première
 * requête. L'URL vient de src/lib/env.ts, jamais d'ici.
 */

// Sur globalThis : next dev recharge les modules, et chaque rechargement ouvrirait un pool de plus.
const DB_KEY = Symbol.for("trouvio.db");
const holder = globalThis as { [DB_KEY]?: Database };

// $client : le pool sous-jacent, tel que drizzle() le rend (fermeture, état des connexions).
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };
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

/** Base du serveur web : rien n'est lu à l'import (le build n'a pas de base), un pool par processus. */
export function getDb(): Database {
  holder[DB_KEY] ??= createDatabase(
    createPool(getEnv("database").DATABASE_URL, {
      applicationName: "trouvio-web",
    }),
  );
  return holder[DB_KEY];
}
