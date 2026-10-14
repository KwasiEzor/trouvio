import { describe, expect, it } from "vitest";

import { stripSessionTokens } from "./session-token-hook";

const USER = { id: "u", email: "alex@example.com" };

describe("stripSessionTokens", () => {
  it("met token à null et retire session.token, quelle que soit la route", () => {
    expect(
      stripSessionTokens({
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
  });

  it("retire session.token même sans token à la racine", () => {
    expect(
      stripSessionTokens({ user: USER, session: { id: "s", token: "jeton" } }),
    ).toEqual({ user: USER, session: { id: "s" } });
  });

  it("laisse intacte une réponse sans jeton", () => {
    expect(stripSessionTokens({ success: true })).toBeUndefined();
    expect(stripSessionTokens({ token: null, user: USER })).toBeUndefined();
  });

  it.each([
    ["nulle", null],
    ["absente", undefined],
    ["non objet", "texte"],
    ["tableau", [{ token: "jeton" }]],
    ["Response", new Response("{}")],
    ["erreur", new Error("refus")],
  ])("ne touche pas une réponse %s", (_, returned) => {
    expect(stripSessionTokens(returned)).toBeUndefined();
  });
});
