import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvValidationError } from "@/lib/env";
import { everythingLogged, fakeLogger } from "@/test/db/fake-logger";

import { main, type SeedCliDeps } from "./cli";

const EXEMPLE = readFileSync(
  new URL("../../../../db/seed.example.json", import.meta.url),
  "utf8",
);
const LOCALE = "postgres://trouvio:trouvio@127.0.0.1:54329/trouvio_dev";
const DISTANTE =
  "postgresql://app:SENTINELLE@hote-sentinelle.example/trouvio?sslmode=require";

function deps(overrides: Partial<SeedCliDeps> = {}) {
  const log = fakeLogger();
  const readFile = vi.fn(async (_path: string) => EXEMPLE);
  const apply = vi.fn(async () => ({ users: 1, profiles: 1 }));
  return {
    log,
    readFile,
    apply,
    all: {
      readTarget: () => ({
        nodeEnv: "development" as const,
        databaseUrl: LOCALE,
      }),
      readFile,
      apply,
      log,
      ...overrides,
    } satisfies SeedCliDeps,
  };
}

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error("ENOENT: no such file or directory"), {
    code: "ENOENT",
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("db:seed", () => {
  it("lit l'environnement et le fichier sur disque par défaut", async () => {
    vi.stubEnv("DATABASE_URL", LOCALE);
    const log = fakeLogger();
    const apply = vi.fn(async () => ({ users: 1, profiles: 1 }));
    expect(await main(["--file", "db/seed.example.json"], { apply, log })).toBe(
      0,
    );
    expect(apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        users: [expect.objectContaining({ email: "alex.martin@example.com" })],
      }),
    );
  });

  it("signale un fichier présent mais illisible", async () => {
    const { all, log } = deps({
      readFile: async () => {
        throw Object.assign(new Error("EACCES: permission denied"), {
          code: "EACCES",
        });
      },
    });
    expect(await main([], all)).toBe(1);
    expect(log.error).toHaveBeenCalledWith("fichier de seed illisible", {
      file: "db/seed.local.json",
    });
  });

  it("lit db/seed.local.json par défaut et applique le seed", async () => {
    const { all, readFile, apply, log } = deps();
    expect(await main([], all)).toBe(0);
    expect(readFile).toHaveBeenCalledWith("db/seed.local.json");
    expect(apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        users: [expect.objectContaining({ role: "admin" })],
      }),
    );
    expect(log.info).toHaveBeenCalledWith(
      "1 utilisateur, 1 profil (base locale)",
      { users: 1, profiles: 1 },
    );
  });

  it("accepte --file et ignore le séparateur -- transmis par pnpm", async () => {
    const { all, readFile } = deps();
    expect(await main(["--", "--file", "db/seed.example.json"], all)).toBe(0);
    expect(readFile).toHaveBeenCalledWith("db/seed.example.json");
  });

  it("accorde le pluriel", async () => {
    const { all, log } = deps({
      apply: async () => ({ users: 2, profiles: 2 }),
    });
    await main([], all);
    expect(log.info).toHaveBeenCalledWith(
      "2 utilisateurs, 2 profils (base locale)",
      { users: 2, profiles: 2 },
    );
  });

  it("indique comment créer le fichier local s'il manque", async () => {
    const { all, log } = deps({
      readFile: async () => {
        throw enoent();
      },
    });
    expect(await main([], all)).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      "fichier de seed absent : copie db/seed.example.json vers db/seed.local.json",
      { file: "db/seed.local.json" },
    );
  });

  it("rejette un fichier invalide avant d'ouvrir la base, sans citer son contenu", async () => {
    const { all, log, apply } = deps({
      readFile: async () => '{ "users": [ { "email": "sentinelle@example.com" ',
    });
    expect(await main([], all)).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "fichier de seed invalide",
      expect.objectContaining({ file: "db/seed.local.json" }),
    );
    expect(everythingLogged(log)).not.toMatch(/sentinelle/i);
  });

  it("distingue une configuration invalide d'un refus de la garde", async () => {
    const { all, log, readFile } = deps({
      readTarget: () => {
        throw new EnvValidationError("database", [
          { name: "DATABASE_URL", reason: "manquante" },
        ]);
      },
    });
    expect(await main([], all)).toBe(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "configuration invalide",
      expect.objectContaining({ err: expect.any(EnvValidationError) }),
    );
  });

  it("refuse la production sans lire le fichier", async () => {
    const { all, readFile, apply, log } = deps({
      readTarget: () => ({ nodeEnv: "production", databaseUrl: LOCALE }),
    });
    expect(await main(["--allow-remote"], all)).toBe(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "seed refusé",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("refuse une base distante sans --allow-remote, sans la citer", async () => {
    const { all, readFile, log } = deps({
      readTarget: () => ({ nodeEnv: "development", databaseUrl: DISTANTE }),
    });
    expect(await main([], all)).toBe(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(everythingLogged(log)).not.toMatch(/sentinelle/i);
  });

  it("accepte une base distante avec --allow-remote", async () => {
    const { all, apply, log } = deps({
      readTarget: () => ({ nodeEnv: "development", databaseUrl: DISTANTE }),
    });
    expect(await main(["--allow-remote"], all)).toBe(0);
    expect(apply).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith(
      "1 utilisateur, 1 profil (base distante)",
      { users: 1, profiles: 1 },
    );
    expect(everythingLogged(log)).not.toMatch(/sentinelle/i);
  });

  it("refuse une option inconnue", async () => {
    const { all, readFile, log } = deps();
    expect(await main(["--force"], all)).toBe(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      "options invalides",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("échoue proprement si l'écriture en base échoue", async () => {
    const { all, log } = deps({
      apply: async () => {
        throw new Error("violates check constraint");
      },
    });
    expect(await main([], all)).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      "seed échoué (base locale)",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});
