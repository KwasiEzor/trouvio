import { describe, expect, it } from "vitest";

import { deriveRateLimitSecret, normalizeEmail, rateLimitKey } from "./keys";

const SECRET = deriveRateLimitSecret("s".repeat(32));
const RULE = { windowSeconds: 300, max: 10 };

describe("rateLimitKey", () => {
  it("rend la même clé pour la même entrée", () => {
    expect(rateLimitKey(SECRET, "auth-ip", RULE, "203.0.113.7")).toBe(
      rateLimitKey(SECRET, "auth-ip", RULE, "203.0.113.7"),
    );
  });

  it("rend une empreinte hexadécimale de 64 caractères", () => {
    expect(rateLimitKey(SECRET, "auth-ip", RULE, "203.0.113.7")).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("ne contient jamais le sujet en clair", () => {
    const key = rateLimitKey(
      SECRET,
      "sign-in-account",
      RULE,
      "alex@example.com",
    );
    expect(key).not.toContain("alex");
    expect(key).not.toContain("example");
  });

  it.each([
    ["la portée", () => rateLimitKey(SECRET, "sign-in-account", RULE, "x")],
    [
      "la fenêtre",
      () =>
        rateLimitKey(SECRET, "auth-ip", { ...RULE, windowSeconds: 60 }, "x"),
    ],
    ["le sujet", () => rateLimitKey(SECRET, "auth-ip", RULE, "y")],
    [
      "le secret",
      () =>
        rateLimitKey(
          deriveRateLimitSecret("t".repeat(32)),
          "auth-ip",
          RULE,
          "x",
        ),
    ],
  ])("change avec %s", (_label, other) => {
    expect(other()).not.toBe(rateLimitKey(SECRET, "auth-ip", RULE, "x"));
  });

  it("ne confond pas une fenêtre et un sujet qui se prolongent", () => {
    // Sans longueur préfixée, « 30 » + « 0x » et « 300 » + « x » donneraient le même texte.
    expect(
      rateLimitKey(SECRET, "auth-ip", { ...RULE, windowSeconds: 30 }, "0x"),
    ).not.toBe(rateLimitKey(SECRET, "auth-ip", RULE, "x"));
  });
});

describe("deriveRateLimitSecret", () => {
  it("ne rend pas le secret d'origine", () => {
    expect(deriveRateLimitSecret("s".repeat(32))).not.toContain("ssss");
  });
});

describe("normalizeEmail", () => {
  it("ramène la casse et les espaces à une seule forme", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
  });
});
