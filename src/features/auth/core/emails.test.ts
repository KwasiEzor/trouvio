import { describe, expect, it } from "vitest";

import {
  existingAccountEmail,
  formatDuration,
  magicLinkEmail,
  verificationEmail,
} from "./emails";

const URL_LIEN = "https://trouvio.example/api/auth/essai?token=SENTINELLE";
const IGNORE = "Si tu n'es pas à l'origine de cette demande, ignore cet email";

const GABARITS = [
  ["vérification", verificationEmail({ url: URL_LIEN })],
  ["lien magique", magicLinkEmail({ url: URL_LIEN })],
  ["compte existant", existingAccountEmail({ signInUrl: URL_LIEN })],
] as const;

describe("textes des emails d'authentification", () => {
  it.each(GABARITS)(
    "%s : le sujet ne porte ni lien ni jeton",
    (_nom, { subject }) => {
      expect(subject).not.toMatch(/https?:|SENTINELLE|token/i);
      expect(subject.length).toBeLessThanOrEqual(60);
    },
  );

  it.each(GABARITS)(
    "%s : le corps cite le lien une seule fois, seul sur sa ligne",
    (_nom, { text }) => {
      expect(text.split("\n").filter((ligne) => ligne === URL_LIEN)).toEqual([
        URL_LIEN,
      ]);
      expect(text.split(URL_LIEN)).toHaveLength(2);
    },
  );

  it.each(GABARITS)(
    "%s : dit quoi faire si la demande ne vient pas du destinataire",
    (_nom, { text }) => {
      expect(text).toContain(IGNORE);
    },
  );

  it("annonce la durée de validité de chaque lien", () => {
    expect(verificationEmail({ url: URL_LIEN }).text).toContain(
      "valable 1 heure",
    );
    expect(magicLinkEmail({ url: URL_LIEN }).text).toContain(
      "valable 10 minutes et ne sert qu'une fois",
    );
  });

  it("donne un sujet propre à chaque email", () => {
    expect(GABARITS.map(([, { subject }]) => subject)).toEqual([
      "Confirme ton adresse email",
      "Ton lien de connexion à Trouvio",
      "Tu as déjà un compte Trouvio",
    ]);
  });

  // Le nom saisi à l'inscription est choisi par celui qui remplit le formulaire, pas par le
  // destinataire : le recopier ferait de l'email un support d'hameçonnage.
  it("ne recopie aucune donnée saisie à l'inscription", () => {
    const { text } = verificationEmail({ url: URL_LIEN });
    expect(text.startsWith("Bonjour,\n")).toBe(true);
  });
});

describe("formatDuration", () => {
  it.each([
    [60, "1 minute"],
    [600, "10 minutes"],
    [3600, "1 heure"],
    [7200, "2 heures"],
    [5400, "90 minutes"],
  ])("%i secondes → %s", (secondes, attendu) => {
    expect(formatDuration(secondes)).toBe(attendu);
  });
});
