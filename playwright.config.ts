import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { E2E_OUTBOX_DIR, e2eDatabaseUrl } from "./src/test/e2e/environment";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// E2E sur un build de production (`next start`), jamais sur le serveur de dev.
// Port 3100 pour ne pas croiser un `pnpm dev` sur 3000.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  // Un test instable se corrige, il ne se relance pas (.claude/rules/tests.md).
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Base trouvio_e2e recréée et migrée, boîte d'envoi vidée, puis build et serveur de production.
    command: `pnpm e2e:prepare && pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    // `next start` exige APP_URL en production (src/lib/env.ts) ; aucun fichier .env n'est lu ni créé.
    // SENTRY_DSN vide : Next ne remplace pas une variable déjà définie, donc un DSN du fichier
    // local de l'utilisateur n'active jamais Sentry pendant les E2E (observabilite.spec.ts).
    // Depuis P1-02, le serveur exige une base et un secret : base locale des E2E (Docker local ou
    // service de la CI), secret tiré à chaque exécution, emails d'authentification déposés sur disque.
    env: {
      APP_URL: BASE_URL,
      SENTRY_DSN: "",
      DATABASE_URL: e2eDatabaseUrl(),
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
      AUTH_EMAIL_OUTBOX_DIR: E2E_OUTBOX_DIR,
    },
  },
});
