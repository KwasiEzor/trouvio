import { describe, expect, it } from "vitest";

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
