import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeLogger } from "@/test/db/fake-logger";

import { createDatabase, createPool } from "./client";

const URL_LOCALE = "postgres://trouvio:trouvio@127.0.0.1:54329/trouvio_dev";

describe("createPool", () => {
  it("nomme la connexion et borne le pool, sans se connecter", async () => {
    const pool = createPool(URL_LOCALE, {
      applicationName: "trouvio-cli",
      max: 1,
    });
    expect(pool.options).toMatchObject({
      application_name: "trouvio-cli",
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    expect(pool.totalCount).toBe(0);
    await pool.end();
  });

  it("prend 10 connexions au plus par défaut", async () => {
    const pool = createPool(URL_LOCALE, { applicationName: "trouvio-web" });
    expect(pool.options.max).toBe(10);
    await pool.end();
  });

  it("journalise une connexion inactive perdue au lieu de faire tomber le processus", async () => {
    const log = fakeLogger();
    const pool = createPool(
      URL_LOCALE,
      { applicationName: "trouvio-job" },
      log,
    );
    const perdue = new Error("Connection terminated unexpectedly");
    pool.emit("error", perdue);
    expect(log.error).toHaveBeenCalledWith(
      "connexion inactive à la base perdue",
      { source: "db", err: perdue },
    );
    await pool.end();
  });
});

describe("createDatabase", () => {
  it("expose le schéma à l'API de requêtes", async () => {
    const pool = createPool(URL_LOCALE, { applicationName: "trouvio-cli" });
    const db = createDatabase(pool);
    expect(Object.keys(db.query)).toContain("users");
    await pool.end();
  });
});

describe("getDb", () => {
  const CLE = Symbol.for("trouvio.db");
  // Module rechargé à chaque test : getEnv mémorise la configuration lue.
  const charge = async () => {
    vi.resetModules();
    return import("./client");
  };

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", URL_LOCALE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as Record<symbol, unknown>)[CLE];
  });

  it("ne lit aucune configuration à l'import (le build n'a pas de base)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(charge()).resolves.toHaveProperty("getDb");
  });

  it("refuse de servir sans DATABASE_URL, en ne citant que le nom de la variable", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDb } = await charge();
    expect(() => getDb()).toThrow(
      "Configuration invalide (database) — manquantes : DATABASE_URL",
    );
  });

  it("rend toujours la même base, nommée trouvio-web, sans ouvrir de connexion", async () => {
    const { getDb } = await charge();
    const db = getDb();
    expect(getDb()).toBe(db);
    expect(db.$client.options.application_name).toBe("trouvio-web");
    expect(db.$client.totalCount).toBe(0);
    await db.$client.end();
  });

  it("garde le même pool quand le module est rechargé (next dev)", async () => {
    const premier = (await charge()).getDb();
    const second = (await charge()).getDb();
    expect(second).toBe(premier);
    await premier.$client.end();
  });
});
