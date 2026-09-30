import { describe, expect, it, vi } from "vitest";

import { EnvValidationError } from "@/lib/env";
import { everythingLogged, fakeLogger } from "@/test/db/fake-logger";

import { main } from "./migrate-cli";

const LOCALE = "postgres://trouvio:trouvio@127.0.0.1:54329/trouvio_dev";
const DISTANTE =
  "postgresql://proprio:SENTINELLE@hote-sentinelle.example/trouvio?sslmode=require";

describe("db:migrate", () => {
  it("applique les migrations et le dit, base locale", async () => {
    const log = fakeLogger();
    const migrate = vi.fn(async () => ({ applied: 1 }));
    const code = await main({ readUrl: () => LOCALE, log, migrate });
    expect(code).toBe(0);
    expect(migrate).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith(
      "1 migration appliquée (base locale)",
      { applied: 1 },
    );
  });

  it("accorde le pluriel et ne cite jamais une base distante", async () => {
    const log = fakeLogger();
    const code = await main({
      readUrl: () => DISTANTE,
      log,
      migrate: async () => ({ applied: 2 }),
    });
    expect(code).toBe(0);
    expect(log.info).toHaveBeenCalledWith(
      "2 migrations appliquées (base distante)",
      { applied: 2 },
    );
    expect(everythingLogged(log)).not.toMatch(/SENTINELLE|sentinelle/);
  });

  it("dit qu'il n'y a rien à appliquer", async () => {
    const log = fakeLogger();
    await main({
      readUrl: () => LOCALE,
      log,
      migrate: async () => ({ applied: 0 }),
    });
    expect(log.info).toHaveBeenCalledWith(
      "0 migration appliquée (base locale)",
      { applied: 0 },
    );
  });

  it("échoue sans rien lancer si la variable manque", async () => {
    const log = fakeLogger();
    const migrate = vi.fn(async () => ({ applied: 0 }));
    const code = await main({
      readUrl: () => {
        throw new EnvValidationError("databaseMigration", [
          { name: "DATABASE_MIGRATION_URL", reason: "manquante" },
        ]);
      },
      log,
      migrate,
    });
    expect(code).toBe(1);
    expect(migrate).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("échoue si une migration échoue, sans citer la base", async () => {
    const log = fakeLogger();
    const code = await main({
      readUrl: () => DISTANTE,
      log,
      migrate: async () => {
        throw new Error("relation déjà existante");
      },
    });
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      "migration échouée (base distante)",
      expect.objectContaining({ err: expect.any(Error) }),
    );
    expect(everythingLogged(log)).not.toMatch(/SENTINELLE|sentinelle/);
  });
});
