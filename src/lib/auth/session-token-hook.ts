import { createAuthMiddleware } from "better-auth/api";

/**
 * Retire le jeton de session des réponses JSON de Better Auth (P1-05, ADR 0016). Le navigateur le
 * reçoit déjà en cookie HttpOnly : le rendre aussi en JSON l'exposerait à tout script de la page.
 * Le jeton seul ne forge pas le cookie (signé par HMAC) : hygiène, pas prise de session immédiate.
 * La forme de la réponse est gardée (token: null), le client de Better Auth n'en dépend pas.
 */

export const TOKEN_STRIPPED_PATHS: readonly string[] = [
  "/sign-in/email",
  "/sign-up/email",
  // Sans callbackURL, la vérification répond en JSON avec token et session.token.
  "/magic-link/verify",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Nouveau corps sans jeton, ou undefined si la réponse reste telle quelle. */
export function stripSessionTokens(
  path: string,
  returned: unknown,
): Record<string, unknown> | undefined {
  // Objet simple seulement : ni Response, ni APIError, ni tableau.
  if (!TOKEN_STRIPPED_PATHS.includes(path) || !isPlainObject(returned))
    return undefined;
  const body: Record<string, unknown> = { ...returned, token: null };
  if (isPlainObject(returned["session"])) {
    const { token: _token, ...session } = returned["session"];
    body["session"] = session;
  }
  return body;
}

/** hooks.after : s'applique au handler HTTP comme aux appels serveur (auth.api.*). */
export const sessionTokenHook = createAuthMiddleware(async (ctx) => {
  const body = stripSessionTokens(ctx.path, ctx.context.returned);
  if (body !== undefined) return ctx.json(body);
});
