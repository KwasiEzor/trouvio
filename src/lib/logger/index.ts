import { captureException, captureMessage } from "@sentry/core";

import { getEnv, type Runtime } from "../env";
import { createLogger, type ErrorReporter, type Logger } from "./logger";

export type { LogContext, Logger } from "./logger";

/**
 * Signalement via @sentry/core : fonctionne avec le client de @sentry/nextjs (web) comme avec
 * celui de @sentry/node (job, P5), à condition que les versions soient identiques
 * (sdk-versions.test.ts). Sans client initialisé (tests, pas de DSN), les appels sont sans effet.
 */
export const sentryReporter: ErrorReporter = {
  exception(error, context) {
    captureException(error, { contexts: { log: context } });
  },
  message(message, context) {
    captureMessage(message, { level: "error", contexts: { log: context } });
  },
};

type DefaultLoggerDeps = {
  env?: typeof getEnv;
  runtime?: Runtime;
};

/** Logger serveur : niveau lu (paresseusement) dans LOG_LEVEL, warn et error sur stderr. */
export function createDefaultLogger({
  env = getEnv,
  runtime = "web",
}: DefaultLoggerDeps = {}): Logger {
  return createLogger({
    level: () => env("core").LOG_LEVEL,
    write: (level, line) => {
      const stream =
        level === "warn" || level === "error" ? process.stderr : process.stdout;
      stream.write(`${line}\n`);
    },
    runtime,
    report: sentryReporter,
  });
}

/** Seul moyen légitime de journaliser dans src/ (côté serveur). */
export const logger = createDefaultLogger();
