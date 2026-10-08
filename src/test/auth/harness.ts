import { createAuth, type Auth } from "@/lib/auth";
import type { AuthEmail, AuthEmailKind } from "@/lib/auth/mailer";
import type { Database } from "@/lib/db/client";
import type { Logger } from "@/lib/logger";

/**
 * Harnais des tests d'intégration de Better Auth (projet Vitest « db ») : instance sur une vraie
 * base, appels par le handler HTTP (la seule porte des formulaires), emails capturés.
 */

export const BASE = "http://localhost:3000";
export const PASSWORD = "un mot de passe assez long";
export const SESSION_COOKIE = "better-auth.session_token";

export function buildTestAuth({
  db,
  outbox,
  log,
  baseURL = BASE,
}: {
  db: Database;
  outbox: AuthEmail[];
  log: Logger;
  baseURL?: string;
}): Auth {
  return createAuth({
    db,
    baseURL,
    secret: "s".repeat(32),
    mailer: {
      send: (email) => {
        outbox.push(email);
        return Promise.resolve();
      },
    },
    log,
  });
}

export type Call = {
  method?: "GET" | "POST";
  body?: unknown;
  cookie?: string | undefined;
  origin?: string | null;
};

export async function callAuth(
  instance: Auth,
  path: string,
  { method = "POST", body, cookie, origin = BASE }: Call = {},
): Promise<Response> {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie !== undefined) headers.set("cookie", cookie);
  if (origin !== null) headers.set("origin", origin);
  const base = instance.options.baseURL ?? BASE;
  return instance.handler(
    new Request(`${base}/api/auth${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    }),
  );
}

/** Valeur « nom=valeur » du cookie de session posé par une réponse, ou undefined. */
export function sessionCookie(response: Response): string | undefined {
  const raw = response.headers
    .getSetCookie()
    .find((line) => line.split("=")[0]?.endsWith(SESSION_COOKIE));
  const pair = raw?.split(";")[0];
  return pair === undefined || pair.endsWith("=") ? undefined : pair;
}

export function lastEmail(outbox: AuthEmail[], kind: AuthEmailKind): AuthEmail {
  const email = outbox.filter((candidate) => candidate.kind === kind).at(-1);
  if (email === undefined) throw new Error(`aucun email « ${kind} »`);
  return email;
}

/** Chemin et paramètres d'un lien reçu, rejoués sur le handler. */
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname.replace(/^\/api\/auth/, "")}${parsed.search}`;
}

/** Inscription puis clic sur le lien de vérification : rend le cookie de session. */
export async function signUpVerified(
  instance: Auth,
  outbox: AuthEmail[],
  email: string,
): Promise<string> {
  await callAuth(instance, "/sign-up/email", {
    body: { name: "Alex", email, password: PASSWORD },
  });
  const response = await callAuth(
    instance,
    pathOf(lastEmail(outbox, "verification").url),
    { method: "GET" },
  );
  const cookie = sessionCookie(response);
  if (cookie === undefined) throw new Error("vérification sans session");
  return cookie;
}
