import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import type { Logger } from "@/lib/logger";
import { createLogThrottle } from "@/lib/logger/throttle";

import {
  buildPageCsp,
  createNonce,
  type PageCspInput,
} from "./security-headers";

/**
 * Logique de src/proxy.ts (P1-05, ADR 0016), dépendances injectées. Pour chaque page :
 * - CSP à nonce : en réponse, et en en-tête de requête, où Next lit le nonce de ses scripts ;
 * - requestId : écrase la valeur du client, transmis aux journaux (requestLogger) et renvoyé ;
 * - prolongation de session sur un chargement de document porteur d'un cookie de session.
 *
 * Ne décide jamais d'un accès : chaque page et chaque action se protège (requireUser). Une panne de
 * lecture de session est journalisée puis ignorée : la page échoue fermé d'elle-même.
 */

export const REQUEST_ID_HEADER = "x-request-id";

export type ProxyDeps = {
  /** Lignes Set-Cookie de la lecture de session (src/lib/auth/session-refresh.ts). */
  refreshSession: (headers: Headers) => Promise<readonly string[]>;
  log: Logger;
  csp: () => Omit<PageCspInput, "nonce">;
  newNonce?: () => string;
  newRequestId?: () => string;
  now?: () => number;
};

const REFRESH_FAILURE_KEY = "session-refresh";

/**
 * Chargement de document : GET ou HEAD, sec-fetch-dest « document » ou absent (anciens navigateurs,
 * curl). Les navigations RSC et les prefetchs (sec-fetch-dest « empty ») ne lisent pas la session :
 * au plus une lecture en base par chargement de page. Les en-têtes Flight (rsc,
 * next-router-prefetch) sont retirés avant le proxy : seul sec-fetch-dest reste lisible.
 */
function shouldRefresh(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const dest = request.headers.get("sec-fetch-dest");
  if (dest !== null && dest !== "document") return false;
  return getSessionCookie(request) !== null;
}

export function createProxy({
  refreshSession,
  log,
  csp,
  newNonce = createNonce,
  newRequestId = () => crypto.randomUUID(),
  now = Date.now,
}: ProxyDeps): (request: NextRequest) => Promise<NextResponse> {
  // Une base en panne ferait journaliser chaque chargement de page : un warn par fenêtre.
  const failureThrottle = createLogThrottle({
    windowMs: 10 * 60 * 1000,
    maxKeys: 1,
    now,
  });

  return async (request) => {
    const policy = buildPageCsp({ ...csp(), nonce: newNonce() });
    const requestId = newRequestId();

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("content-security-policy", policy);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("content-security-policy", policy);
    response.headers.set(REQUEST_ID_HEADER, requestId);

    if (shouldRefresh(request)) {
      try {
        for (const line of await refreshSession(request.headers)) {
          response.headers.append("set-cookie", line);
        }
      } catch (err) {
        const { log: shouldLog, suppressed } =
          failureThrottle(REFRESH_FAILURE_KEY);
        if (shouldLog) {
          log.warn("prolongation de session impossible", {
            requestId,
            err,
            ...(suppressed > 0 ? { suppressed } : {}),
          });
        }
      }
    }
    return response;
  };
}
