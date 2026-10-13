import { describe, expect, it } from "vitest";

import { SERVED_PATHS } from "@/test/auth/served-paths";

import {
  AUTH_IP_DEFAULT_RULE,
  AUTH_IP_RULES,
  EMAIL_RECIPIENT_RULES,
  RATE_LIMITED_PATHS,
  SIGN_IN_ACCOUNT_RULES,
} from "./rules";

// Tout changement de seuil doit se voir dans la revue (ADR 0015).
describe("règles de limitation", () => {
  it("par IP et par chemin", () => {
    expect(AUTH_IP_DEFAULT_RULE).toEqual({ windowSeconds: 10, max: 100 });
    expect(AUTH_IP_RULES).toEqual({
      "/sign-in/email": { windowSeconds: 300, max: 10 },
      "/sign-up/email": { windowSeconds: 600, max: 5 },
      "/sign-in/magic-link": { windowSeconds: 600, max: 5 },
      "/send-verification-email": { windowSeconds: 600, max: 3 },
      "/magic-link/confirm": { windowSeconds: 60, max: 5 },
      "/verify-email/confirm": { windowSeconds: 300, max: 10 },
    });
  });

  it("par compte pour la connexion par mot de passe", () => {
    expect(SIGN_IN_ACCOUNT_RULES).toEqual([
      { windowSeconds: 900, max: 10 },
      { windowSeconds: 86_400, max: 30 },
    ]);
  });

  it("par destinataire d'email", () => {
    expect(EMAIL_RECIPIENT_RULES).toEqual([
      { windowSeconds: 900, max: 3 },
      { windowSeconds: 86_400, max: 10 },
    ]);
  });

  it("nomme exactement les routes servies non paramétrées", () => {
    expect([...RATE_LIMITED_PATHS].sort()).toEqual(
      SERVED_PATHS.filter((path) => !path.includes(":")),
    );
  });

  it("nomme chaque chemin qui a sa propre règle", () => {
    for (const path of Object.keys(AUTH_IP_RULES)) {
      expect(RATE_LIMITED_PATHS).toContain(path);
    }
  });

  it("ne nomme aucun chemin paramétré", () => {
    expect(RATE_LIMITED_PATHS.filter((path) => path.includes(":"))).toEqual([]);
  });
});
