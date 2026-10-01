import path from "node:path";

import { testDatabaseUrl } from "@/test/db/url";

/**
 * Environnement des E2E, partagé par playwright.config.ts (serveur testé), la préparation de la
 * base et les tests qui lisent la boîte d'envoi. Tout est en boucle locale : TEST_DATABASE_URL
 * refuse une base distante (src/lib/env.ts). Module léger : chargé par chaque worker Playwright.
 */

export const E2E_DATABASE = "trouvio_e2e";

/** Emails d'authentification déposés par le serveur testé (AUTH_EMAIL_OUTBOX_DIR), ignoré par git. */
export const E2E_OUTBOX_DIR = path.resolve(".tmp", "e2e-outbox");

export function e2eDatabaseUrl(): string {
  return testDatabaseUrl(E2E_DATABASE);
}
