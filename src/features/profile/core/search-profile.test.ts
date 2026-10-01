import { describe, expect, it } from "vitest";

import { searchProfileSchema, type SearchProfileInput } from "./search-profile";

const NOMINAL: SearchProfileInput = {
  titles: ["Développeur full-stack"],
  skills: ["TypeScript", "React"],
  yearsExp: 5,
  languages: ["fr", "en"],
  zone: "Namur",
  remoteModes: ["hybrid", "remote"],
  contracts: ["permanent"],
  minSalary: 45000,
  excludedKeywords: ["stage"],
  excludedCompanies: [],
  threshold: 60,
  channels: { telegram: { enabled: true } },
  sendHour: 7,
  frequency: "daily",
};

function chemins(input: unknown): string[] {
  const result = searchProfileSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("searchProfileSchema — cas nominaux", () => {
  it("accepte un profil complet et le renvoie tel quel", () => {
    expect(searchProfileSchema.parse(NOMINAL)).toEqual(NOMINAL);
  });

  it("applique les valeurs par défaut d'un profil minimal", () => {
    expect(
      searchProfileSchema.parse({ titles: ["Comptable"], zone: "Liège" }),
    ).toEqual({
      titles: ["Comptable"],
      skills: [],
      languages: [],
      zone: "Liège",
      remoteModes: ["onsite", "hybrid", "remote"],
      contracts: [],
      excludedKeywords: [],
      excludedCompanies: [],
      threshold: 60,
      channels: {},
      sendHour: 7,
      frequency: "daily",
    });
  });

  it("retire les espaces et les doublons des listes", () => {
    const profil = searchProfileSchema.parse({
      ...NOMINAL,
      skills: [" React ", "React", "SQL"],
      remoteModes: ["remote", "remote"],
      languages: ["fr", "fr"],
    });
    expect(profil.skills).toEqual(["React", "SQL"]);
    expect(profil.remoteModes).toEqual(["remote"]);
    expect(profil.languages).toEqual(["fr"]);
  });

  it.each([
    ["threshold", 0],
    ["threshold", 100],
    ["sendHour", 0],
    ["sendHour", 23],
    ["yearsExp", 0],
    ["yearsExp", 60],
    ["minSalary", 0],
  ] as const)("accepte la borne %s = %i", (champ, valeur) => {
    expect(chemins({ ...NOMINAL, [champ]: valeur })).toEqual([]);
  });
});

describe("searchProfileSchema — cas négatifs", () => {
  it.each([
    ["threshold", -1],
    ["threshold", 101],
    ["threshold", 60.5],
    ["sendHour", 24],
    ["sendHour", -1],
    ["yearsExp", -1],
    ["yearsExp", 61],
    ["minSalary", -1],
  ] as const)("refuse %s = %d", (champ, valeur) => {
    expect(chemins({ ...NOMINAL, [champ]: valeur })).toEqual([champ]);
  });

  it("refuse une clé inconnue (objet strict)", () => {
    expect(chemins({ ...NOMINAL, salaireSecret: 1 })).toEqual([""]);
  });

  it("refuse un canal inconnu", () => {
    expect(
      chemins({ ...NOMINAL, channels: { whatsapp: { enabled: true } } }),
    ).toEqual(["channels"]);
  });

  it.each(["français", "FR", "f", ""])("refuse la langue %j", (langue) => {
    expect(chemins({ ...NOMINAL, languages: [langue] })).toEqual([
      "languages.0",
    ]);
  });

  it("refuse une liste de modes de travail vide", () => {
    expect(chemins({ ...NOMINAL, remoteModes: [] })).toEqual(["remoteModes"]);
  });

  it("refuse un profil sans intitulé recherché", () => {
    expect(chemins({ ...NOMINAL, titles: [] })).toEqual(["titles"]);
  });

  it("refuse une zone vide", () => {
    expect(chemins({ ...NOMINAL, zone: "   " })).toEqual(["zone"]);
  });

  it("refuse un contrat inconnu", () => {
    expect(chemins({ ...NOMINAL, contracts: ["cdi"] })).toEqual([
      "contracts.0",
    ]);
  });

  it("plafonne chaque liste à 50 éléments", () => {
    const cinquanteEtUn = Array.from({ length: 51 }, (_, i) => `mot${i}`);
    expect(chemins({ ...NOMINAL, excludedKeywords: cinquanteEtUn })).toEqual([
      "excludedKeywords",
    ]);
    expect(
      chemins({ ...NOMINAL, excludedKeywords: cinquanteEtUn.slice(1) }),
    ).toEqual([]);
  });
});
