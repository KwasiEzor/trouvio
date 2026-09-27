import { defineConfig, devices } from "@playwright/test";

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
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    // `next start` exige APP_URL en production (src/lib/env.ts) ; aucun fichier .env n'est lu ni créé.
    env: { APP_URL: BASE_URL },
  },
});
