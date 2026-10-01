import type { TestProject } from "vitest/node";

import { createPool } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

import {
  createEmptyDatabase,
  dropDatabase,
  testDatabaseUrl,
  uniqueDatabaseName,
  withAdmin,
} from "./test-database";

/**
 * Crée et migre une base modèle une fois par exécution du projet « db » ; chaque fichier de test
 * la clone (test-database.ts). La base modèle est supprimée à la fin, même en cas d'échec.
 */
export default async function setup(project: TestProject) {
  const template = uniqueDatabaseName("trouvio_test_tpl");
  await withAdmin((admin) => createEmptyDatabase(admin, template));
  try {
    const pool = createPool(testDatabaseUrl(template), {
      applicationName: "trouvio-test",
      max: 1,
    });
    try {
      await runMigrations(pool);
    } finally {
      // Aucune connexion ne doit rester ouverte sur un modèle qu'on clone.
      await pool.end();
    }
  } catch (error) {
    await withAdmin((admin) => dropDatabase(admin, template));
    throw error;
  }
  project.provide("templateDatabase", template);
  return async () => {
    await withAdmin((admin) => dropDatabase(admin, template));
  };
}
