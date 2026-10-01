import { describe, expect, it } from "vitest";
import { z } from "zod";

import { magicLinkSchema, signInSchema, signUpSchema } from "./credentials";

const motDePasse = (longueur: number) => "a".repeat(longueur);
const INSCRIPTION = {
  name: "Camille Fictif",
  email: "camille@example.com",
  password: motDePasse(12),
};

function erreurs(schema: z.ZodType, valeur: unknown): Record<string, string[]> {
  const resultat = schema.safeParse(valeur);
  if (resultat.success) return {};
  return z.flattenError(resultat.error).fieldErrors as Record<string, string[]>;
}

describe("signUpSchema", () => {
  it("accepte une inscription valide", () => {
    expect(signUpSchema.parse(INSCRIPTION)).toEqual(INSCRIPTION);
  });

  it.each([
    [11, false],
    [12, true],
    [128, true],
    [129, false],
  ])("mot de passe de %i caractères : accepté = %s", (longueur, accepte) => {
    const resultat = signUpSchema.safeParse({
      ...INSCRIPTION,
      password: motDePasse(longueur),
    });
    expect(resultat.success).toBe(accepte);
  });

  it("dit en français pourquoi un mot de passe est refusé", () => {
    expect(
      erreurs(signUpSchema, { ...INSCRIPTION, password: motDePasse(11) }),
    ).toEqual({ password: ["12 caractères au minimum."] });
    expect(
      erreurs(signUpSchema, { ...INSCRIPTION, password: motDePasse(129) }),
    ).toEqual({ password: ["128 caractères au maximum."] });
  });

  it("ne retouche pas le mot de passe (les espaces comptent)", () => {
    const password = `  ${motDePasse(10)}  `;
    expect(signUpSchema.parse({ ...INSCRIPTION, password }).password).toBe(
      password,
    );
  });

  it("nettoie l'email et le met en minuscules", () => {
    expect(
      signUpSchema.parse({
        ...INSCRIPTION,
        email: "  Alex.MARTIN@Example.COM ",
      }).email,
    ).toBe("alex.martin@example.com");
  });

  it.each(["", "   ", "pas-un-email", "a@b", `${"a".repeat(250)}@example.com`])(
    "refuse l'email « %s »",
    (email) => {
      expect(erreurs(signUpSchema, { ...INSCRIPTION, email })).toEqual({
        email: ["Adresse email invalide."],
      });
    },
  );

  it("retire les espaces autour du nom et le borne à 100 caractères", () => {
    expect(
      signUpSchema.parse({ ...INSCRIPTION, name: "  Camille Fictif " }).name,
    ).toBe("Camille Fictif");
    expect(
      signUpSchema.safeParse({ ...INSCRIPTION, name: "n".repeat(100) }).success,
    ).toBe(true);
    expect(
      erreurs(signUpSchema, { ...INSCRIPTION, name: "n".repeat(101) }),
    ).toEqual({ name: ["100 caractères au maximum."] });
  });

  it.each(["", "   "])("refuse le nom vide « %s »", (name) => {
    expect(erreurs(signUpSchema, { ...INSCRIPTION, name })).toEqual({
      name: ["Indique ton nom."],
    });
  });

  it("refuse tout champ inconnu, dont un rôle", () => {
    expect(
      signUpSchema.safeParse({ ...INSCRIPTION, role: "admin" }).success,
    ).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepte un mot de passe plus court que la politique actuelle (elle ne se devine pas à la connexion)", () => {
    expect(
      signInSchema.parse({ email: " Camille@Example.com", password: "court" }),
    ).toEqual({ email: "camille@example.com", password: "court" });
  });

  it("refuse un mot de passe vide ou démesuré", () => {
    expect(
      erreurs(signInSchema, { email: "camille@example.com", password: "" }),
    ).toEqual({ password: ["Indique ton mot de passe."] });
    expect(
      signInSchema.safeParse({
        email: "camille@example.com",
        password: motDePasse(129),
      }).success,
    ).toBe(false);
  });
});

describe("magicLinkSchema", () => {
  it("ne prend qu'un email, nettoyé et en minuscules", () => {
    expect(magicLinkSchema.parse({ email: " Camille@Example.com " })).toEqual({
      email: "camille@example.com",
    });
    expect(erreurs(magicLinkSchema, { email: "pas-un-email" })).toEqual({
      email: ["Adresse email invalide."],
    });
  });
});
