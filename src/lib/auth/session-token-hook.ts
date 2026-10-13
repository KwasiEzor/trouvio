import { createAuthMiddleware } from "better-auth/api";

/**
 * Retire le jeton de session des réponses JSON de Better Auth (P1-05, ADR 0016). Le navigateur le
 * reçoit déjà en cookie HttpOnly : le rendre aussi en JSON l'exposerait à tout script de la page.
 * Le jeton seul ne forge pas le cookie (signé par HMAC) : hygiène, pas prise de session immédiate.
 *
 * Générique, sans liste de chemins : une route rouverte (/change-password en P7-02), un plugin ou
 * une montée de version qui rend un jeton reste couvert. La forme de la réponse est gardée
 * (token: null) ; le client de Better Auth n'en dépend pas.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Nouveau corps sans jeton, ou undefined si la réponse n'en porte aucun. */
export function stripSessionTokens(
  returned: unknown,
): Record<string, unknown> | undefined {
  // Objet simple seulement : ni Response, ni APIError, ni tableau.
  if (!isPlainObject(returned)) return undefined;
  const session = returned["session"];
  const sessionToken = isPlainObject(session) && "token" in session;
  const rootToken =
    returned["token"] !== undefined && returned["token"] !== null;
  if (!rootToken && !sessionToken) return undefined;

  const body: Record<string, unknown> = { ...returned };
  if (rootToken) body["token"] = null;
  if (sessionToken) {
    const { token: _token, ...rest } = session;
    body["session"] = rest;
  }
  return body;
}

/** hooks.after : s'applique au handler HTTP comme aux appels serveur (auth.api.*). */
export const sessionTokenHook = createAuthMiddleware(async (ctx) => {
  const body = stripSessionTokens(ctx.context.returned);
  // undefined : la réponse de l'endpoint reste telle quelle.
  return body === undefined ? undefined : ctx.json(body);
});
