import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Base locale (db/local/compose.yaml) et service Postgres de la CI : même image, épinglée par
 * digest, et une base locale jamais exposée hors de la boucle locale (ADR 0012).
 */

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const compose = read("db/local/compose.yaml");
const ci = read(".github/workflows/ci.yml");
const IMAGE = /^\s*image:\s*(postgres:\S+)\s*$/m;

describe("base Postgres locale", () => {
  it("épingle l'image par digest", () => {
    expect(compose.match(IMAGE)?.[1]).toMatch(
      /^postgres:18-alpine@sha256:[0-9a-f]{64}$/,
    );
  });

  it("utilise en CI exactement la même image qu'en local", () => {
    expect(ci.match(IMAGE)?.[1]).toBe(compose.match(IMAGE)?.[1]);
  });

  it("ne publie le port que sur la boucle locale", () => {
    const ports = [...compose.matchAll(/^\s*-\s*"([^"]*:5432)"\s*$/gm)].map(
      (match) => match[1],
    );
    expect(ports).toEqual(["127.0.0.1:54329:5432"]);
  });

  it("ferme le superutilisateur à toute connexion par mot de passe", () => {
    // Le bac à sable joint tout port localhost : seul le socket du conteneur doit l'ouvrir.
    expect(read("db/local/init.sql")).toMatch(
      /^alter role postgres password null;$/m,
    );
  });

  it("crée en CI le même rôle non superutilisateur qu'en local", () => {
    expect(ci).toContain("-f db/local/init.sql");
    expect(read("db/local/init.sql")).toMatch(/\bnosuperuser\b/);
  });
});

describe("seed personnel", () => {
  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8" });

  it.each([
    "db/seed.local.json",
    "db/seed.neon.json",
    "db/seed.local.bak.json",
  ])("%s est ignoré par git et absent du dépôt", (file) => {
    expect(() => git("check-ignore", "-q", file)).not.toThrow();
    expect(git("ls-files", file)).toBe("");
  });

  it("garde l'exemple fictif dans le dépôt", () => {
    expect(() => git("check-ignore", "-q", "db/seed.example.json")).toThrow();
    expect(git("ls-files", "db/seed.example.json")).toBe(
      "db/seed.example.json\n",
    );
  });
});
