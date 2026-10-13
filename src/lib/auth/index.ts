import { betterAuth } from "better-auth";

import { getDb } from "@/lib/db/client";
import { createPgRateLimitStore } from "@/lib/db/rate-limit-store";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { deriveRateLimitSecret } from "@/lib/rate-limit/keys";
import { createRateLimiter } from "@/lib/rate-limit/limiter";

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
  if (instance === undefined) {
    const db = getDb();
    const secret = getEnv("auth").BETTER_AUTH_SECRET;
    const log = logger.child({ source: "auth" });
    instance = createAuth({
      db,
      baseURL: getEnv("core").APP_URL,
      secret,
      mailer: resolveAuthMailer(),
      log,
      // Actif partout, développement compris : même comportement qu'en production (ADR 0015).
      rateLimit: {
        enabled: true,
        limiter: createRateLimiter({
          store: createPgRateLimitStore(db),
          secret: deriveRateLimitSecret(secret),
          log,
        }),
      },
    });
  }
  return instance;
}
