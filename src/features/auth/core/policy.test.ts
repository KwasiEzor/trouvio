import { describe, expect, it } from "vitest";

import {
  AUTH_PATHS,
  EMAIL_VERIFICATION_TTL_SECONDS,
  MAGIC_LINK_TTL_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_REFRESH_SECONDS,
  SESSION_TTL_SECONDS,
} from "./policy";

const MINUTE = 60;
const JOUR = 24 * 60 * MINUTE;

describe("politique d'authentification", () => {
  it("exige un mot de passe de 12 à 128 caractères", () => {
    expect([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]).toEqual([12, 128]);
  });

  it("donne 10 minutes à un lien magique et une heure à un lien de vérification", () => {
    expect(MAGIC_LINK_TTL_SECONDS).toBe(10 * MINUTE);
    expect(EMAIL_VERIFICATION_TTL_SECONDS).toBe(60 * MINUTE);
  });

  it("garde une session 7 jours, prolongée au plus une fois par jour", () => {
    expect(SESSION_TTL_SECONDS).toBe(7 * JOUR);
    expect(SESSION_REFRESH_SECONDS).toBe(JOUR);
  });

  // Ces chemins servent de callbackURL : une adresse externe ferait une redirection ouverte.
  it.each(Object.entries(AUTH_PATHS))(
    "garde le chemin %s à l'intérieur de l'application",
    (_nom, chemin) => {
      expect(chemin).toMatch(/^\/(?![/\\])/);
      expect(new URL(chemin, "https://trouvio.example").origin).toBe(
        "https://trouvio.example",
      );
    },
  );
});
