import { notFound, redirect } from "next/navigation";

import { AUTH_PATHS } from "@/features/auth/core/policy";
import { logger } from "@/lib/logger";

import {
  decideAccess,
  type AccessDecision,
  type AccessNeed,
  type CurrentUser,
} from "./access";
import { getSession } from "./session";

/**
 * Contrôles d'accès côté serveur (P1-03, ADR 0014), sur la session de la requête.
 *
 * - Pages et Server Actions : requireUser / requireAdmin. Non connecté → redirection vers la
 *   connexion ; connecté mais pas admin → 404 (notFound, forbidden() de Next est expérimental).
 * - Route Handlers : authorizeRoute, qui rend la réponse 401 ou 403 à renvoyer telle quelle.
 *
 * Règles d'usage :
 * - appeler le helper en première ligne, hors de tout try/catch : redirect() et notFound() lèvent
 *   une exception que Next doit recevoir (sinon unstable_rethrow) ;
 * - dans un layout, jamais comme seul contrôle : chaque page et chaque action se protège ;
 * - proxy.ts (P1-05) ne fait que des contrôles optimistes.
 *
 * Une panne de lecture de session remonte telle quelle : la changer en « non connecté » masquerait
 * la panne et bouclerait sur la connexion.
 */

type SignInPath = typeof AUTH_PATHS.signIn | typeof AUTH_PATHS.invalidLink;

async function decide(need: AccessNeed): Promise<AccessDecision> {
  const decision = decideAccess(await getSession(), need);
  // Identifiant interne seulement, jamais l'email. Les refus « non connecté » ne sont pas
  // journalisés : trop de bruit.
  if (!decision.ok && decision.reason === "forbidden") {
    logger.warn("accès admin refusé", { userId: decision.userId });
  }
  return decision;
}

export async function requireUser(
  options: { signInPath?: SignInPath } = {},
): Promise<CurrentUser> {
  const decision = await decide("user");
  if (!decision.ok) redirect(options.signInPath ?? AUTH_PATHS.signIn);
  return decision.user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const decision = await decide("admin");
  if (decision.ok) return decision.user;
  if (decision.reason === "unauthenticated") redirect(AUTH_PATHS.signIn);
  notFound();
}

export async function authorizeRoute(
  need: AccessNeed,
): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: Response }
> {
  const decision = await decide(need);
  if (decision.ok) return decision;
  const unauthenticated = decision.reason === "unauthenticated";
  return {
    ok: false,
    response: Response.json(
      { error: unauthenticated ? "UNAUTHENTICATED" : "FORBIDDEN" },
      {
        status: unauthenticated ? 401 : 403,
        headers: { "cache-control": "no-store" },
      },
    ),
  };
}
