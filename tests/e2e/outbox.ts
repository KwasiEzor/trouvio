import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { expect } from "@playwright/test";

import type { AuthEmail, AuthEmailKind } from "../../src/lib/auth/mailer";
import { E2E_OUTBOX_DIR } from "../../src/test/e2e/environment";

/**
 * Boîte d'envoi du serveur testé (AUTH_EMAIL_OUTBOX_DIR) : chaque email d'authentification y est
 * déposé en fichier JSON au lieu d'être envoyé. Les tests y lisent le lien, comme la personne le
 * lirait dans sa messagerie.
 */

type Depot = { chemin: string; email: AuthEmail };

async function chercher(
  to: string,
  kind: AuthEmailKind,
): Promise<Depot | undefined> {
  let fichiers: string[];
  try {
    fichiers = await readdir(E2E_OUTBOX_DIR);
  } catch {
    return undefined; // dossier créé au premier email
  }
  for (const fichier of fichiers.filter((nom) => nom.includes(`-${kind}-`))) {
    const chemin = path.join(E2E_OUTBOX_DIR, fichier);
    try {
      const email = JSON.parse(await readFile(chemin, "utf8")) as AuthEmail;
      if (email.to === to) return { chemin, email };
    } catch {
      // fichier en cours d'écriture : relu à la prochaine tentative
    }
  }
  return undefined;
}

/** Attend l'email de ce type adressé à `to`, le retire de la boîte d'envoi et le rend. */
export async function prendreEmail(
  to: string,
  kind: AuthEmailKind,
): Promise<AuthEmail> {
  let depot: Depot | undefined;
  await expect
    .poll(
      async () => {
        depot = await chercher(to, kind);
        return depot !== undefined;
      },
      { message: `email « ${kind} » attendu dans la boîte d'envoi` },
    )
    .toBe(true);
  if (!depot) throw new Error("boîte d'envoi : email introuvable");
  await rm(depot.chemin);
  return depot.email;
}
