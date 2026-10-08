import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "@/lib/env";
import { logger, type Logger } from "@/lib/logger";

/**
 * Envoi des emails d'authentification (vérification, lien magique, compte existant), tous
 * déclenchés par la personne elle-même. Jusqu'à P4-03 (Resend), le seul transport est une boîte
 * d'envoi sur disque, que src/lib/env.ts refuse hors boucle locale. Ni le destinataire, ni le
 * lien, ni le jeton ne sont journalisés.
 */

export type AuthEmailKind = "verification" | "magic-link" | "existing-account";

export type AuthEmail = {
  readonly kind: AuthEmailKind;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Le lien du corps, à part : lu par les tests de parcours dans la boîte d'envoi. */
  readonly url: string;
};

export type AuthMailer = { send(email: AuthEmail): Promise<void> };

export class AuthEmailNotConfiguredError extends Error {
  override readonly name = "AuthEmailNotConfiguredError";

  constructor() {
    super(
      "Aucun transport n'est configuré pour les emails d'authentification.",
    );
  }
}

/** Un fichier JSON par email, lisible par son seul propriétaire. */
export function createOutboxMailer(dir: string, log: Logger): AuthMailer {
  return {
    async send(email) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const name = `${Date.now()}-${email.kind}-${randomBytes(8).toString("hex")}.json`;
      // wx : un fichier existant n'est jamais remplacé.
      await writeFile(path.join(dir, name), JSON.stringify(email), {
        mode: 0o600,
        flag: "wx",
      });
      log.info("email d'authentification déposé", {
        kind: email.kind,
        transport: "outbox",
      });
    },
  };
}

// Sans transport, rien ne part : le lien magique échoue (erreur générique). L'inscription, elle,
// répond 200 (Better Auth envoie en tâche de fond et journalise l'échec, en warn) : le compte
// reste non vérifié, donc inutilisable. Jusqu'à P4-03.
const unconfiguredMailer: AuthMailer = {
  send: () => Promise.reject(new AuthEmailNotConfiguredError()),
};

export function resolveAuthMailer(
  env: typeof getEnv = getEnv,
  log: Logger = logger,
): AuthMailer {
  const dir = env("authEmail").AUTH_EMAIL_OUTBOX_DIR;
  return dir === undefined ? unconfiguredMailer : createOutboxMailer(dir, log);
}
