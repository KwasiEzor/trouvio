import { createPool } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import {
  createEmptyDatabase,
  dropDatabase,
  testDatabaseUrl,
  withAdmin,
} from "@/test/db/admin";

import { E2E_DATABASE } from "./environment";

// La préparation supprime la base visée : seule une base des E2E est admise, jamais trouvio_dev.
const E2E_NAME = new RegExp(`^${E2E_DATABASE}(_\\w+)?$`);

/** Recrée la base des E2E, vide, et lui applique toutes les migrations. */
export async function prepareE2eDatabase(
  name: string = E2E_DATABASE,
): Promise<{ applied: number }> {
  if (!E2E_NAME.test(name)) throw new Error("Nom de base E2E refusé.");
  await withAdmin(async (admin) => {
    await dropDatabase(admin, name);
    await createEmptyDatabase(admin, name);
  });
  const pool = createPool(testDatabaseUrl(name), {
    applicationName: "trouvio-test",
    max: 1,
  });
  try {
    return await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
