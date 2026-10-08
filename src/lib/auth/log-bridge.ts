import type { Logger } from "@/lib/logger";
import { maskQueryValues } from "@/lib/logger/redact";

import { AuthEmailNotConfiguredError } from "./mailer";

/**
 * Journaux de Better Auth vers lib/logger (option `logger.log`). Better Auth écrit des emails et
 * des URL dans ses messages : le logger les masque. Ses arguments supplémentaires ne sont pas
 * recopiés, sauf une Error, sérialisée et masquée par le logger.
 */
export function bridge(log: Logger) {
  return (level: string, message: string, ...args: unknown[]): void => {
    const err = args.find((arg) => arg instanceof Error);
    const context = err === undefined ? undefined : { err };
    // Une erreur SQL peut arriver par son seul message, valeurs liées comprises.
    const text = maskQueryValues(String(message));
    // error() signale à Sentry : réservé aux vraies pannes. Une « erreur » sans Error vient d'une
    // requête refusée (origine, callbackURL), qu'un attaquant répète à volonté ; l'absence de
    // transport d'email (jusqu'à P4-03) se déclenche à chaque inscription.
    const report =
      err !== undefined && !(err instanceof AuthEmailNotConfiguredError);
    if (level === "error" && report) log.error(text, context);
    else if (level === "error" || level === "warn") log.warn(text, context);
    else if (level === "debug") log.debug(text, context);
    else log.info(text, context);
  };
}
