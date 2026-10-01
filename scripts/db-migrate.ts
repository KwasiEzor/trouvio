// Point d'entrée de pnpm db:migrate ; la logique (testée) est dans src/lib/db/migrate-cli.ts.
import { main } from "../src/lib/db/migrate-cli";

void main().then((code) => {
  process.exitCode = code;
});
