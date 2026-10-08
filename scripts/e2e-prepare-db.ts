// Lancé par playwright.config.ts avant le build : base des E2E recréée et migrée, boîte d'envoi
// des emails d'authentification vidée. La logique (testée) est dans src/test/e2e.
import { rm } from "node:fs/promises";

import { logger } from "../src/lib/logger";
import { E2E_OUTBOX_DIR } from "../src/test/e2e/environment";
import { prepareE2eDatabase } from "../src/test/e2e/prepare-database";

async function main(): Promise<number> {
  try {
    await rm(E2E_OUTBOX_DIR, { recursive: true, force: true });
    const { applied } = await prepareE2eDatabase();
    logger.info("base des E2E prête", { applied });
    return 0;
  } catch (err) {
    logger.error("préparation de la base des E2E échouée", { err });
    return 1;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
