import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseSeedText, SeedFileError } from "./seed-file";

const EXEMPLE = readFileSync(
  new URL("../../../../db/seed.example.json", import.meta.url),
  "utf8",
);

function utilisateur(email: string, profil: Record<string, unknown> = {}) {
  return {
    email,
    name: "Camille Durand",
    profile: { titles: ["Comptable"], zone: "Liège", ...profil },
  };
}

function erreur(text: string): SeedFileError {
  try {
    parseSeedText(text);
  } catch (error) {
    if (error instanceof SeedFileError) return error;
    throw error;
  }
  throw new Error("aucune SeedFileError levée");
}

describe("parseSeedText", () => {
  it("valide db/seed.example.json", () => {
    const seed = parseSeedText(EXEMPLE);
    expect(seed.users).toHaveLength(1);
    expect(seed.users[0]?.email).toMatch(/@example\.com$/);
  });

  it("met l'email en minuscules et applique rôle et plan par défaut", () => {
    const seed = parseSeedText(
      JSON.stringify({ users: [utilisateur(" Camille@Example.COM ")] }),
    );
    expect(seed.users[0]).toMatchObject({
      email: "camille@example.com",
      role: "user",
      plan: "free",
    });
  });

  it("refuse deux utilisateurs au même email, casse ignorée", () => {
    const err = erreur(
      JSON.stringify({
        users: [
          utilisateur("camille@example.com"),
          utilisateur("CAMILLE@example.com"),
        ],
      }),
    );
    expect(err.paths).toEqual(["users.1.email"]);
  });

  it.each([
    ["aucun utilisateur", { users: [] }, "users"],
    [
      "clé inconnue à la racine",
      { users: [utilisateur("a@example.com")], x: 1 },
      "",
    ],
    [
      "email invalide",
      { users: [utilisateur("pas-un-email")] },
      "users.0.email",
    ],
    [
      "rôle inconnu",
      { users: [{ ...utilisateur("a@example.com"), role: "root" }] },
      "users.0.role",
    ],
  ])("refuse %s", (_cas, contenu, chemin) => {
    expect(erreur(JSON.stringify(contenu)).paths).toEqual([chemin]);
  });

  it("refuse plus de 20 utilisateurs", () => {
    const users = Array.from({ length: 21 }, (_, i) =>
      utilisateur(`u${i}@example.com`),
    );
    expect(erreur(JSON.stringify({ users })).paths).toEqual(["users"]);
  });

  it("ne cite jamais une valeur du fichier, seulement des chemins", () => {
    const err = erreur(
      JSON.stringify({
        users: [
          utilisateur("sentinelle.nom@example.com", {
            minSalary: -987654,
            titles: ["Poste sentinelle"],
          }),
        ],
      }),
    );
    expect(err.paths).toEqual(["users.0.profile.minSalary"]);
    expect(err.message).toContain("users.0.profile.minSalary");
    expect(err.message).not.toMatch(/987654|sentinelle/i);
  });

  it("refuse un JSON illisible sans citer son contenu", () => {
    const err = erreur('{ "users": [ { "email": "sentinelle@example.com" ');
    expect(err.paths).toEqual([]);
    expect(err.message).toBe("Seed invalide : JSON illisible.");
  });
});
