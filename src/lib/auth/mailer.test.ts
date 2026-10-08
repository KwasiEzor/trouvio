import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Env, EnvDomain } from "@/lib/env";
import { everythingLogged, fakeLogger } from "@/test/db/fake-logger";

import {
  AuthEmailNotConfiguredError,
  createOutboxMailer,
  resolveAuthMailer,
  type AuthEmail,
} from "./mailer";

const EMAIL: AuthEmail = {
  kind: "magic-link",
  to: "sentinelle@example.com",
  subject: "Ton lien de connexion à Trouvio",
  text: "Ouvre ce lien :\nhttps://trouvio.example/lien?token=SENTINELLE",
  url: "https://trouvio.example/lien?token=SENTINELLE",
};

/** Lecteur d'environnement factice : seul le domaine authEmail est servi. */
const envAvec =
  (dossier: string | undefined) =>
  <D extends EnvDomain>(_domaine: D) =>
    ({ AUTH_EMAIL_OUTBOX_DIR: dossier }) as Env<D>;

const droits = async (chemin: string) => (await stat(chemin)).mode & 0o777;

describe("boîte d'envoi sur disque", () => {
  let racine: string;
  let dossier: string;

  beforeEach(async () => {
    racine = await mkdtemp(path.join(tmpdir(), "trouvio-boite-"));
    dossier = path.join(racine, "boite");
  });

  afterEach(async () => {
    await rm(racine, { recursive: true, force: true });
  });

  it("dépose un fichier JSON par email, lisible par son seul propriétaire", async () => {
    await createOutboxMailer(dossier, fakeLogger()).send(EMAIL);

    const fichiers = await readdir(dossier);
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0]).toMatch(/^\d{13}-magic-link-[0-9a-f]{16}\.json$/);
    const chemin = path.join(dossier, fichiers[0] ?? "");
    expect(JSON.parse(await readFile(chemin, "utf8"))).toEqual(EMAIL);
    expect(await droits(chemin)).toBe(0o600);
    expect(await droits(dossier)).toBe(0o700);
  });

  it("ne remplace jamais un email déjà déposé", async () => {
    const mailer = createOutboxMailer(dossier, fakeLogger());
    await Promise.all([
      mailer.send(EMAIL),
      mailer.send(EMAIL),
      mailer.send(EMAIL),
    ]);
    expect(await readdir(dossier)).toHaveLength(3);
  });

  it("journalise le dépôt sans destinataire, sans lien et sans jeton", async () => {
    const log = fakeLogger();
    await createOutboxMailer(dossier, log).send(EMAIL);
    expect(log.info).toHaveBeenCalledWith("email d'authentification déposé", {
      kind: "magic-link",
      transport: "outbox",
    });
    expect(everythingLogged(log)).not.toMatch(/sentinelle|trouvio\.example/i);
  });

  it("résout la boîte d'envoi quand AUTH_EMAIL_OUTBOX_DIR est posée", async () => {
    await resolveAuthMailer(envAvec(dossier), fakeLogger()).send(EMAIL);
    expect(await readdir(dossier)).toHaveLength(1);
  });

  it("échoue fermé sans transport configuré : aucun email ne part, rien n'est écrit", async () => {
    const mailer = resolveAuthMailer(envAvec(undefined), fakeLogger());
    await expect(mailer.send(EMAIL)).rejects.toBeInstanceOf(
      AuthEmailNotConfiguredError,
    );
    await expect(mailer.send(EMAIL)).rejects.not.toThrow(/sentinelle/i);
    await expect(readdir(dossier)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
