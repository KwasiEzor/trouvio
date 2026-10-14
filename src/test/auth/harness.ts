import { createAuth, type Auth } from "@/lib/auth";
import type { AuthEmail, AuthEmailKind } from "@/lib/auth/mailer";
import type { Database } from "@/lib/db/client";
import type { Logger } from "@/lib/logger";
import type { RateLimiter } from "@/lib/rate-limit/types";

import { unlimitedLimiter } from "../rate-limit/fakes";

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
  // Limitation coupée par défaut : les tests de parcours enchaînent plus de requêtes que les
  // seuils. Les tests de limitation (rate-limit.db.test.ts) passent le limiteur réel.
  rateLimit = { enabled: false, limiter: unlimitedLimiter() },
}: {
  db: Database;
  outbox: AuthEmail[];
  log: Logger;
  baseURL?: string;
  rateLimit?: { enabled: boolean; limiter: RateLimiter };
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
    rateLimit,
  });
}

export type Call = {
  method?: "GET" | "POST";
  body?: unknown;
  cookie?: string | undefined;
  origin?: string | null;
  /** x-forwarded-for, tel que posé par le reverse proxy. */
  ip?: string;
  /** En-têtes en plus (Fetch Metadata, content-type). */
  headers?: Record<string, string>;
};

export async function callAuth(
  instance: Auth,
  path: string,
  {
    method = "POST",
    body,
    cookie,
    origin = BASE,
    ip,
    headers: extra,
  }: Call = {},
): Promise<Response> {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie !== undefined) headers.set("cookie", cookie);
  if (origin !== null) headers.set("origin", origin);
  if (ip !== undefined) headers.set("x-forwarded-for", ip);
  for (const [name, value] of Object.entries(extra ?? {})) {
    headers.set(name, value);
  }
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

/** Jeton d'un lien reçu par email (pages /activation et /connexion/lien). */
export function tokenOf(url: string): string {
  const token = new URL(url).searchParams.get("token");
  if (token === null) throw new Error("lien sans jeton");
  return token;
}

/** Clic sur « Activer mon compte » de la page /activation. */
export async function confirmVerification(
  instance: Auth,
  url: string,
  password: string,
  options: Call = {},
): Promise<Response> {
  return callAuth(instance, "/verify-email/confirm", {
    ...options,
    body: { token: tokenOf(url), password },
  });
}

/** Clic sur « Me connecter » de la page /connexion/lien. */
export async function confirmMagicLink(
  instance: Auth,
  url: string,
  options: Call = {},
): Promise<Response> {
  return callAuth(instance, "/magic-link/confirm", {
    ...options,
    body: { token: tokenOf(url) },
  });
}

/** Inscription puis activation par mot de passe : rend le cookie de session. */
export async function signUpVerified(
  instance: Auth,
  outbox: AuthEmail[],
  email: string,
): Promise<string> {
  await callAuth(instance, "/sign-up/email", {
    body: { name: "Alex", email, password: PASSWORD },
  });
  const response = await confirmVerification(
    instance,
    lastEmail(outbox, "verification").url,
    PASSWORD,
  );
  const cookie = sessionCookie(response);
  if (cookie === undefined) throw new Error("activation sans session");
  return cookie;
}
