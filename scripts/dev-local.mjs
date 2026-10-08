// pnpm dev:local : `next dev` sur la base Docker locale (ADR 0012), sans fichier de secrets.
// db/local/dev.vars (lu par node --env-file) donne la base ; ce script ajoute ce que le serveur
// exige depuis P1-02 et qui ne se commite pas : un secret d'authentification tiré à chaque
// lancement (les sessions tombent au redémarrage) et la boîte d'envoi des emails, sous .tmp/.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const child = spawn("next", ["dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_EMAIL_OUTBOX_DIR: ".tmp/outbox",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
