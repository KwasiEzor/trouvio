import { describe, expect, it } from "vitest";

import { fauxJwt } from "@/test/secrets-factices";

import {
  activationUrl,
  confirmMagicLinkBodySchema,
  confirmVerificationBodySchema,
  linkTokenSchema,
  magicLinkRecordSchema,
  magicLinkUrl,
  parseMagicLinkRecord,
  verificationPayloadSchema,
} from "./links";

const APP = "https://trouvio.example";

describe("URL des liens envoyés par email", () => {
  it("mène l'activation vers une page de l'application, jamais vers /api/auth", () => {
    const url = new URL(activationUrl(APP, "abc.def-ghi_jkl"));
    expect(url.origin).toBe(APP);
    expect(url.pathname).toBe("/activation");
    expect(url.searchParams.get("token")).toBe("abc.def-ghi_jkl");
    expect(url.toString()).not.toContain("/api/auth");
  });

  it("mène le lien magique vers une page de l'application, jamais vers /api/auth", () => {
    const url = new URL(magicLinkUrl(APP, "AbCdEf"));
    expect(url.origin).toBe(APP);
    expect(url.pathname).toBe("/connexion/lien");
    expect(url.searchParams.get("token")).toBe("AbCdEf");
    expect(url.search).toBe("?token=AbCdEf");
  });

  it("encode un jeton inattendu au lieu de l'injecter dans l'URL", () => {
    const url = new URL(magicLinkUrl(APP, "a&callbackURL=//evil.example"));
    expect([...url.searchParams.keys()]).toEqual(["token"]);
  });
});

describe("linkTokenSchema", () => {
  it.each([
    ["JWT", fauxJwt()],
    ["lien magique", "a".repeat(32)],
  ])("accepte un jeton %s", (_nom, jeton) => {
    expect(linkTokenSchema.safeParse(jeton).success).toBe(true);
  });

  it.each([
    ["vide", ""],
    ["trop long", "a".repeat(2049)],
    ["hors alphabet", "abc def"],
    ["avec chevron", "<script>"],
    ["non textuel", 42],
  ])("refuse un jeton %s", (_nom, jeton) => {
    expect(linkTokenSchema.safeParse(jeton).success).toBe(false);
  });
});

describe("corps des confirmations", () => {
  it("activation : jeton et mot de passe borné", () => {
    expect(
      confirmVerificationBodySchema.safeParse({
        token: "abc",
        password: "x".repeat(128),
      }).success,
    ).toBe(true);
    expect(
      confirmVerificationBodySchema.safeParse({
        token: "abc",
        password: "x".repeat(129),
      }).success,
    ).toBe(false);
    expect(
      confirmVerificationBodySchema.safeParse({ token: "abc", password: "" })
        .success,
    ).toBe(false);
  });

  it("lien magique : jeton seul", () => {
    expect(confirmMagicLinkBodySchema.safeParse({ token: "abc" }).success).toBe(
      true,
    );
    expect(confirmMagicLinkBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("verificationPayloadSchema", () => {
  it("accepte le jeton d'activation émis à l'inscription", () => {
    expect(
      verificationPayloadSchema.safeParse({
        email: "alex@example.com",
        iat: 1,
        exp: 2,
      }).success,
    ).toBe(true);
  });

  // Jeton de changement d'adresse (/change-email) : il ne doit jamais activer un compte.
  it.each([
    ["updateTo", { updateTo: "autre@example.com" }],
    ["requestType", { requestType: "change-email-verification" }],
  ])("refuse un jeton qui porte %s", (_nom, extra) => {
    expect(
      verificationPayloadSchema.safeParse({
        email: "alex@example.com",
        iat: 1,
        exp: 2,
        ...extra,
      }).success,
    ).toBe(false);
  });

  it("refuse un jeton sans adresse valable", () => {
    expect(verificationPayloadSchema.safeParse({ email: "x" }).success).toBe(
      false,
    );
  });
});

describe("magicLinkRecordSchema", () => {
  it("lit l'enregistrement stocké par Better Auth", () => {
    expect(
      magicLinkRecordSchema.parse({
        type: "magic-link",
        email: "alex@example.com",
        name: "Alex",
      }),
    ).toEqual({ type: "magic-link", email: "alex@example.com", name: "Alex" });
  });

  it("refuse un autre type d'enregistrement", () => {
    expect(
      magicLinkRecordSchema.safeParse({
        type: "otp",
        email: "alex@example.com",
      }).success,
    ).toBe(false);
  });
});

describe("parseMagicLinkRecord", () => {
  it("lit la valeur JSON stockée", () => {
    expect(
      parseMagicLinkRecord('{"type":"magic-link","email":"alex@example.com"}'),
    ).toEqual({ type: "magic-link", email: "alex@example.com" });
  });

  it.each(["pas du json", "null", '{"type":"otp","email":"alex@example.com"}'])(
    "rend null pour %j",
    (value) => {
      expect(parseMagicLinkRecord(value)).toBeNull();
    },
  );
});
