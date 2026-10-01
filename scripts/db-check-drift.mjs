// Dérive entre db/schema.ts et db/migrations : relance drizzle-kit generate sur une copie des
// migrations, dans un dossier temporaire. Un nouveau fichier = schéma modifié sans migration
// (pnpm db:generate oublié). Ne touche jamais db/migrations et ne se connecte à aucune base.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const MIGRATIONS = "db/migrations";
const copy = mkdtempSync(join(tmpdir(), "trouvio-drift-"));

function files(dir) {
  return readdirSync(dir, { recursive: true }).map(String).sort();
}

try {
  cpSync(MIGRATIONS, copy, { recursive: true });
  const before = files(copy);
  // drizzle-kit préfixe --out par « ./ » : lui passer un chemin relatif.
  const output = execFileSync(
    join("node_modules", ".bin", "drizzle-kit"),
    [
      "generate",
      "--dialect",
      "postgresql",
      "--schema",
      "./db/schema.ts",
      "--out",
      relative(process.cwd(), copy),
    ],
    { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
  );
  const added = files(copy).filter((file) => !before.includes(file));
  if (added.length === 0 && !output.includes("No schema changes")) {
    // drizzle-kit peut sortir en code 0 après une erreur : exiger sa confirmation explicite.
    process.stderr.write(
      "drizzle-kit n'a pas confirmé l'absence de changement.\n",
    );
    process.exitCode = 1;
  } else if (added.length > 0) {
    process.stderr.write(
      `db/schema.ts a changé sans migration : lancer pnpm db:generate (${added.join(", ")}).\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Aucune dérive entre db/schema.ts et db/migrations.\n",
    );
  }
} finally {
  rmSync(copy, { recursive: true, force: true });
}
