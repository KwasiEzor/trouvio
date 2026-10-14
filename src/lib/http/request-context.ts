import { headers } from "next/headers";
import { z } from "zod";

import { logger, type Logger } from "@/lib/logger";

import { REQUEST_ID_HEADER } from "./proxy-handler";

/**
 * Logger de la requête en cours (P1-05, ADR 0016) : enfant porteur du requestId posé par
 * src/proxy.ts, pour relier les journaux d'une même requête (et un événement Sentry, où l'en-tête
 * est autorisé). Hors de lib/logger, que le job (P5) utilise sans Next. Appelé dans une requête
 * seulement : headers() hors requête lève, et cette erreur doit remonter (rendu dynamique).
 */

const requestIdSchema = z.uuid();

export async function requestLogger(base: Logger = logger): Promise<Logger> {
  // Valeur écrasée par le proxy ; validée quand même (route hors matcher, en-tête du client).
  const parsed = requestIdSchema.safeParse(
    (await headers()).get(REQUEST_ID_HEADER),
  );
  return parsed.success ? base.child({ requestId: parsed.data }) : base;
}
