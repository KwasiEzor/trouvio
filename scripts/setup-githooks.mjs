// Script « prepare » : active les hooks git versionnés (.githooks/, dont le pre-push qui protège main).
// Multiplateforme (pas de syntaxe shell) et sans effet de bord hors de la racine d'un dépôt git :
// ne fait rien sans git (image Docker), hors dépôt, ou dans un sous-dossier d'un autre dépôt.
import { execFileSync } from "node:child_process";

const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

try {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") process.exit(0);
  // Préfixe non vide : on est dans un sous-dossier d'un dépôt parent, ne pas toucher sa config.
  if (git(["rev-parse", "--show-prefix"]) !== "") process.exit(0);
} catch {
  process.exit(0);
}

try {
  git(["config", "core.hooksPath", ".githooks"]);
} catch {
  console.warn(
    "⚠ Hooks git non activés. Lance à la main : git config core.hooksPath .githooks",
  );
}
