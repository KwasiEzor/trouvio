import { betterAuth } from "better-auth";

import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

import { buildAuthOptions, type AuthDeps } from "./config";
import { resolveAuthMailer } from "./mailer";

/**
 * Instance de Better Auth. Rien n'est lu à l'import : next build importe les routes sans base ni
 * secret. getAuth() construit l'instance à la première requête, puis la réutilise.
 */

export function createAuth(deps: AuthDeps) {
  return betterAuth(buildAuthOptions(deps));
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth({
    db: getDb(),
    baseURL: getEnv("core").APP_URL,
    secret: getEnv("auth").BETTER_AUTH_SECRET,
    mailer: resolveAuthMailer(),
    log: logger.child({ source: "auth" }),
  });
  return instance;
}
