import { getEnv } from "@/lib/env";

/** URL de la base de test, sur la base nommée (base d'administration par défaut). */
export function testDatabaseUrl(database?: string): string {
  const url = new URL(getEnv("testDatabase").TEST_DATABASE_URL);
  if (database) url.pathname = `/${database}`;
  return url.toString();
}
