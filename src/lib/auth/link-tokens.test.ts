import { describe, expect, it } from "vitest";

import { magicLinkIdentifier } from "./link-tokens";

describe("magicLinkIdentifier", () => {
  // Vecteur connu : SHA-256("abc") en base64url sans remplissage (FIPS 180-2).
  it("reprend le format de Better Auth (storeToken: hashed)", () => {
    expect(magicLinkIdentifier("abc")).toBe(
      "magic-link:ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0",
    );
  });

  it("ne garde ni le jeton en clair ni de remplissage", () => {
    const identifier = magicLinkIdentifier("JetonEnClairDeTrenteDeuxLettres");
    expect(identifier).not.toContain("JetonEnClair");
    expect(identifier).toMatch(/^magic-link:[A-Za-z0-9_-]{43}$/);
  });
});
