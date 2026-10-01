// Point d'entrée de pnpm db:seed ; la logique (testée) est dans src/lib/db/seed/cli.ts.
import { main } from "../src/lib/db/seed/cli";

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
