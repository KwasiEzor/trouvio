import type * as SentryCore from "@sentry/core";
import { captureException, captureMessage } from "@sentry/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEnvReader } from "../env";
import { createDefaultLogger, sentryReporter } from "./index";

vi.mock("@sentry/core", async (importOriginal) => ({
  ...(await importOriginal<typeof SentryCore>()),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function sorties() {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  return { stdout, stderr };
}

describe("logger par défaut", () => {
  it("lit le niveau dans l'environnement (LOG_LEVEL)", () => {
    const { stdout, stderr } = sorties();
    const logger = createDefaultLogger({
      env: createEnvReader(() => ({ LOG_LEVEL: "warn" })),
    });
    logger.info("ignoré");
    logger.warn("écrit");
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
  });

  it("écrit debug et info sur stdout, warn et error sur stderr, une ligne terminée par \\n", () => {
    const { stdout, stderr } = sorties();
    const logger = createDefaultLogger({
      env: createEnvReader(() => ({ LOG_LEVEL: "debug" })),
    });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(stdout).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(2);
    const ligne = String(stdout.mock.calls[0]?.[0]);
    expect(ligne.endsWith("\n")).toBe(true);
    expect(JSON.parse(ligne)).toMatchObject({ level: "debug", msg: "d" });
  });

  it("retombe sur info si LOG_LEVEL est invalide, sans lever", () => {
    const { stdout } = sorties();
    const logger = createDefaultLogger({
      env: createEnvReader(() => ({ LOG_LEVEL: "verbeux" })),
    });
    expect(() => {
      logger.debug("d");
      logger.info("i");
    }).not.toThrow();
    expect(stdout).toHaveBeenCalledTimes(1);
  });

  it("peut être créé pour le job", () => {
    const { stdout } = sorties();
    createDefaultLogger({
      env: createEnvReader(() => ({})),
      runtime: "job",
    }).info("i");
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      runtime: "job",
    });
  });

  it("signale error() à Sentry via @sentry/core", () => {
    sorties();
    const erreur = new Error("boum");
    const logger = createDefaultLogger({
      env: createEnvReader(() => ({ LOG_LEVEL: "silent" })),
    });
    logger.error("échec", { source: "adzuna", err: erreur });
    logger.error("sans erreur");
    expect(captureException).toHaveBeenCalledWith(erreur, {
      contexts: { log: { source: "adzuna" } },
    });
    expect(captureMessage).toHaveBeenCalledWith("sans erreur", {
      level: "error",
      contexts: { log: {} },
    });
  });
});

describe("sentryReporter", () => {
  it("transmet le contexte masqué comme contexte « log » de l'événement", () => {
    sentryReporter.exception(new Error("x"), { source: "adzuna" });
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      contexts: { log: { source: "adzuna" } },
    });
  });
});
