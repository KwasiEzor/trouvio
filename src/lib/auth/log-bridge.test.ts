import { describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger/logger";
import { everythingLogged, fakeLogger } from "@/test/db/fake-logger";

import { bridge } from "./log-bridge";
import { AuthEmailNotConfiguredError } from "./mailer";

describe("bridge (journaux de Better Auth vers lib/logger)", () => {
  it("signale une erreur réelle (avec une Error) au niveau error, donc à Sentry", () => {
    const log = fakeLogger();
    const panne = new Error("base injoignable");
    bridge(log)("error", "Failed to create session", panne);
    expect(log.error).toHaveBeenCalledWith("Failed to create session", {
      err: panne,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  // Origine refusée, callbackURL invalide : une sonde ne doit pas consommer le quota Sentry.
  it("ramène à warn une « erreur » sans Error, déclenchée par une requête refusée", () => {
    const log = fakeLogger();
    bridge(log)("error", "Invalid origin: https://evil.example");
    expect(log.warn).toHaveBeenCalledWith(
      "Invalid origin: https://evil.example",
      undefined,
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  it.each([
    ["warn", "warn"],
    ["info", "info"],
    ["debug", "debug"],
    ["success", "info"],
    ["niveau-inconnu", "info"],
  ] as const)("transmet le niveau %s en %s", (niveau, attendu) => {
    const log = fakeLogger();
    bridge(log)(niveau, "message");
    expect(log[attendu]).toHaveBeenCalledWith("message", undefined);
  });

  it("garde l'erreur jointe à un avertissement", () => {
    const log = fakeLogger();
    const cause = new Error("détail");
    bridge(log)("warn", "tentative refusée", cause);
    expect(log.warn).toHaveBeenCalledWith("tentative refusée", { err: cause });
  });

  it("ne recopie aucun argument qui n'est pas une Error", () => {
    const log = fakeLogger();
    bridge(log)(
      "warn",
      "tentative refusée",
      { email: "sentinelle@example.com" },
      "jeton-SENTINELLE",
    );
    expect(everythingLogged(log)).not.toMatch(/sentinelle/i);
  });

  it("accepte un message qui n'est pas une chaîne", () => {
    const log = fakeLogger();
    bridge(log)("info", { toString: () => "objet" } as unknown as string);
    expect(log.info).toHaveBeenCalledWith("objet", undefined);
  });

  it("laisse le logger masquer l'email que Better Auth écrit dans ses messages", () => {
    const lignes: string[] = [];
    const log = createLogger({
      level: () => "debug",
      write: (_niveau, ligne) => lignes.push(ligne),
      runtime: "web",
    });
    bridge(log)(
      "warn",
      "Sign-up attempt for existing email: sentinelle@example.com",
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain("Sign-up attempt for existing email");
    expect(lignes[0]).not.toContain("sentinelle@example.com");
  });

  // Sans transport, chaque inscription déclenche cette erreur : n'importe qui pourrait remplir Sentry.
  it("ramène à warn l'absence de transport d'email", () => {
    const log = fakeLogger();
    const err = new AuthEmailNotConfiguredError();
    bridge(log)("error", "Failed to run background task", err);
    expect(log.warn).toHaveBeenCalledWith("Failed to run background task", {
      err,
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  // Better Auth journalise le seul message d'une erreur SQL (« column », « relation ») : drizzle y
  // recopie les valeurs liées.
  it("retire les valeurs liées d'un message d'erreur SQL", () => {
    const log = fakeLogger();
    bridge(log)(
      "error",
      'Failed query: insert into "users" ("name") values ($1)\nparams: Sentinelle Nom',
    );
    expect(everythingLogged(log)).not.toContain("Sentinelle");
  });
});
