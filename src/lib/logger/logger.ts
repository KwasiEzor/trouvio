import { redact, redactString } from "./redact";
import { serializeError } from "./serialize-error";

/**
 * Cœur du logger, pur et isomorphe : niveau, sortie, horloge et signalement sont injectés.
 * Une ligne JSON par événement ; contexte masqué sous `ctx`, erreur (`ctx.err`) sérialisée sous `err`.
 * Règle d'usage : journaliser OU relancer une erreur, pas les deux (sinon double signalement).
 */

export const LOG_THRESHOLDS = [
  "debug",
  "info",
  "warn",
  "error",
  "silent",
] as const;
export type LogThreshold = (typeof LOG_THRESHOLDS)[number];
export type LogLevel = Exclude<LogThreshold, "silent">;

const RANK: Record<LogThreshold, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

/** Contexte libre ; la clé `err` (erreur ou valeur lancée) est traitée à part. */
export type LogContext = Readonly<Record<string, unknown>>;

/** Signalement à l'outil de suivi d'erreurs (Sentry), appelé par error() uniquement. */
export type ErrorReporter = {
  exception(error: unknown, context: Record<string, unknown>): void;
  message(message: string, context: Record<string, unknown>): void;
};

export type LoggerOptions = {
  level: () => LogThreshold;
  write: (level: LogLevel, line: string) => void;
  runtime: "web" | "job";
  report?: ErrorReporter;
  now?: () => Date;
  bindings?: LogContext;
};

export type Logger = {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  /** Écrit (selon le niveau) ET signale toujours à Sentry. */
  error(msg: string, ctx?: LogContext): void;
  child(bindings: LogContext): Logger;
};

export function createLogger(options: LoggerOptions): Logger {
  const bindings = options.bindings ?? {};
  const now = options.now ?? (() => new Date());

  function threshold(): LogThreshold {
    try {
      return options.level();
    } catch {
      return "info";
    }
  }

  // Un journal ne doit jamais faire échouer l'appelant : chaque étape est protégée.
  function log(level: LogLevel, msg: string, ctx: LogContext = {}): void {
    const err = "err" in ctx ? ctx["err"] : bindings["err"];
    const context = { ...redactContext(bindings), ...redactContext(ctx) };
    const message = redactString(msg);

    if (RANK[level] >= RANK[threshold()]) {
      try {
        const entry = {
          time: now().toISOString(),
          level,
          msg: message,
          service: "trouvio",
          runtime: options.runtime,
          ...(Object.keys(context).length > 0 && { ctx: context }),
          ...(err !== undefined && { err: serializeError(err) }),
        };
        options.write(level, JSON.stringify(entry));
      } catch {
        // Sortie indisponible : l'événement est perdu, l'appelant continue.
      }
    }

    if (level === "error" && options.report) {
      try {
        if (err === undefined) options.report.message(message, context);
        else options.report.exception(err, context);
      } catch {
        // Sentry indisponible : ne pas masquer l'erreur d'origine par une autre.
      }
    }
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    child: (more) =>
      createLogger({ ...options, bindings: { ...bindings, ...more } }),
  };
}

/** Masque le contexte d'origine (pas une copie : un cycle vers lui-même est reconnu) et retire `err`. */
function redactContext(ctx: LogContext): Record<string, unknown> {
  const { err: _err, ...rest } = redact(ctx) as Record<string, unknown>;
  return rest;
}
