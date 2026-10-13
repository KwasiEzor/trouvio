import { describe, expect, it } from "vitest";

import { stripSessionTokens, TOKEN_STRIPPED_PATHS } from "./session-token-hook";

const USER = { id: "u", email: "alex@example.com" };

describe("stripSessionTokens", () => {
  it.each(TOKEN_STRIPPED_PATHS)(
    "met token à null et retire session.token sur %s",
    (path) => {
      expect(
        stripSessionTokens(path, {
          token: "jeton",
          redirect: false,
          user: USER,
          session: { id: "s", token: "jeton", expiresAt: "demain" },
        }),
      ).toEqual({
        token: null,
        redirect: false,
        user: USER,
        session: { id: "s", expiresAt: "demain" },
      });
    },
  );

  it("couvre la connexion, l'inscription et le lien magique", () => {
    expect([...TOKEN_STRIPPED_PATHS].sort()).toEqual([
      "/magic-link/verify",
      "/sign-in/email",
      "/sign-up/email",
    ]);
  });

  it("garde une réponse sans session telle quelle, jeton retiré", () => {
    expect(
      stripSessionTokens("/sign-up/email", { token: null, user: USER }),
    ).toEqual({ token: null, user: USER });
  });

  it("laisse intacte la réponse d'un autre chemin", () => {
    expect(
      stripSessionTokens("/sign-out", { token: "jeton", success: true }),
    ).toBeUndefined();
  });

  it.each([
    ["nulle", null],
    ["absente", undefined],
    ["non objet", "texte"],
    ["tableau", [{ token: "jeton" }]],
    ["Response", new Response("{}")],
    ["erreur", new Error("refus")],
  ])("ne touche pas une réponse %s", (_, returned) => {
    expect(stripSessionTokens("/sign-in/email", returned)).toBeUndefined();
  });
});
