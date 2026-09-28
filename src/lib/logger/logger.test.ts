import { describe, expect, it, vi } from "vitest";

import {
  createLogger,
  type ErrorReporter,
  type LogLevel,
  type LogThreshold,
} from "./logger";
import { REDACTED } from "./redact";

const MAINTENANT = new Date("2026-09-28T08:00:00.000Z");

function harnais(level: LogThreshold = "debug") {
  const lignes: { level: LogLevel; line: string }[] = [];
  const report = {
    exception: vi.fn<ErrorReporter["exception"]>(),
    message: vi.fn<ErrorReporter["message"]>(),
  };
  const logger = createLogger({
    level: () => level,
    write: (lvl, line) => lignes.push({ level: lvl, line }),
    runtime: "web",
    report,
    now: () => MAINTENANT,
  });
  const entrees = () =>
    lignes.map(({ line }) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lignes, entrees, report };
}

describe("createLogger — format", () => {
  it("écrit une ligne JSON avec les champs fixes", () => {
    const { logger, lignes, entrees } = harnais();
    logger.info("collecte terminée", { source: "adzuna", count: 12 });

    expect(lignes).toHaveLength(1);
    expect(entrees()[0]).toEqual({
      time: "2026-09-28T08:00:00.000Z",
      level: "info",
      msg: "collecte terminée",
      service: "trouvio",
      runtime: "web",
      ctx: { source: "adzuna", count: 12 },
    });
  });

  it("omet ctx quand il n'y a aucun contexte", () => {
    const { logger, entrees } = harnais();
    logger.debug("démarrage");
    expect(entrees()[0]).not.toHaveProperty("ctx");
  });

  it("garde un message sur une seule ligne (pas d'injection de ligne)", () => {
    const { logger, lignes } = harnais();
    logger.warn('ligne 1\n{"level":"error","msg":"faux"}');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.line).not.toContain("\n");
  });

  it("imbrique le contexte sous ctx : aucune collision avec les champs fixes", () => {
    const { logger, entrees } = harnais();
    logger.info("essai", { level: "error", msg: "écrasé ?", time: "hier" });
    expect(entrees()[0]).toMatchObject({
      level: "info",
      msg: "essai",
      time: "2026-09-28T08:00:00.000Z",
      ctx: { level: "error", msg: "écrasé ?", time: "hier" },
    });
  });

  it("masque le contexte et le message", () => {
    const { logger, entrees } = harnais();
    logger.info("envoi à kwasi@exemple.fr", {
      userId: "7f9c",
      email: "kwasi@exemple.fr",
      url: "https://api.adzuna.com/v1?app_key=CLE&what=dev",
    });
    const entree = entrees()[0];
    expect(entree?.["msg"]).toBe(`envoi à ${REDACTED}`);
    expect(entree?.["ctx"]).toEqual({
      userId: "7f9c",
      email: REDACTED,
      url: `https://api.adzuna.com/v1?app_key=${REDACTED}&what=dev`,
    });
  });

  it("sérialise ctx.err à part, sous err", () => {
    const { logger, entrees } = harnais();
    logger.warn("tentative échouée", {
      source: "adzuna",
      err: new Error("délai dépassé"),
    });
    const entree = entrees()[0];
    expect(entree?.["ctx"]).toEqual({ source: "adzuna" });
    expect(entree?.["err"]).toMatchObject({
      name: "Error",
      message: "délai dépassé",
    });
  });
});

describe("createLogger — niveaux", () => {
  it("n'écrit pas sous le seuil", () => {
    const { logger, lignes } = harnais("warn");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(lignes.map((ligne) => ligne.level)).toEqual(["warn", "error"]);
  });

  it("n'écrit rien en silent", () => {
    const { logger, lignes } = harnais("silent");
    logger.error("e");
    expect(lignes).toEqual([]);
  });

  it("retombe sur info si le niveau ne peut pas être lu", () => {
    const lignes: string[] = [];
    const logger = createLogger({
      level: () => {
        throw new Error("env invalide");
      },
      write: (_level, line) => lignes.push(line),
      runtime: "job",
    });
    logger.debug("d");
    logger.info("i");
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0] ?? "{}")).toMatchObject({
      msg: "i",
      runtime: "job",
    });
  });
});

describe("createLogger — child", () => {
  it("fusionne les liaisons, l'appel l'emportant en cas de conflit", () => {
    const { logger, entrees } = harnais();
    const enfant = logger.child({ source: "adzuna", run: "r1" });
    enfant.child({ page: 2 }).info("page lue", { run: "r2" });
    expect(entrees()[0]?.["ctx"]).toEqual({
      source: "adzuna",
      run: "r2",
      page: 2,
    });
  });

  it("masque aussi les liaisons", () => {
    const { logger, entrees } = harnais();
    logger.child({ token: "t" }).info("x");
    expect(entrees()[0]?.["ctx"]).toEqual({ token: REDACTED });
  });
});

describe("createLogger — signalement des erreurs (Sentry)", () => {
  it("signale une fois l'erreur d'origine avec le contexte masqué", () => {
    const { logger, report } = harnais();
    const erreur = new Error("collecte échouée");
    logger.error("collecte échouée", {
      source: "adzuna",
      email: "a@b.fr",
      err: erreur,
    });
    expect(report.exception).toHaveBeenCalledTimes(1);
    expect(report.exception).toHaveBeenCalledWith(erreur, {
      source: "adzuna",
      email: REDACTED,
    });
    expect(report.message).not.toHaveBeenCalled();
  });

  it("signale un message quand error() n'a pas d'erreur", () => {
    const { logger, report } = harnais();
    logger.error("quota Adzuna atteint pour a@b.fr", { source: "adzuna" });
    expect(report.message).toHaveBeenCalledWith(
      `quota Adzuna atteint pour ${REDACTED}`,
      { source: "adzuna" },
    );
    expect(report.exception).not.toHaveBeenCalled();
  });

  it("ne signale jamais un warn, même avec une erreur", () => {
    const { logger, report } = harnais();
    logger.warn("nouvelle tentative", { err: new Error("503") });
    logger.info("i");
    expect(report.exception).not.toHaveBeenCalled();
    expect(report.message).not.toHaveBeenCalled();
  });

  it("signale même quand le niveau masque la sortie", () => {
    const { logger, report, lignes } = harnais("silent");
    logger.error("e", { err: new Error("boum") });
    expect(lignes).toEqual([]);
    expect(report.exception).toHaveBeenCalledTimes(1);
  });
});

describe("createLogger — robustesse", () => {
  it("ne lève jamais d'exception si la sortie ou le signalement échoue", () => {
    const logger = createLogger({
      level: () => "debug",
      write: () => {
        throw new Error("stdout fermé");
      },
      runtime: "web",
      report: {
        exception: () => {
          throw new Error("Sentry indisponible");
        },
        message: () => {
          throw new Error("Sentry indisponible");
        },
      },
    });
    expect(() => {
      logger.info("i");
      logger.error("e", { err: new Error("x") });
      logger.error("sans erreur");
    }).not.toThrow();
  });

  it("accepte un contexte circulaire", () => {
    const { logger, entrees } = harnais();
    const ctx: Record<string, unknown> = { etape: 1 };
    ctx["soi"] = ctx;
    logger.info("cycle", ctx);
    expect(entrees()[0]?.["ctx"]).toEqual({ etape: 1, soi: "[Circulaire]" });
  });

  it("horodate avec l'horloge réelle par défaut", () => {
    const lignes: string[] = [];
    createLogger({
      level: () => "info",
      write: (_level, line) => lignes.push(line),
      runtime: "web",
    }).info("i");
    const time = (JSON.parse(lignes[0] ?? "{}") as { time: string }).time;
    expect(Number.isNaN(Date.parse(time))).toBe(false);
  });
});
