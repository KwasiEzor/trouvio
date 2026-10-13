import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

import { normalizeEmail } from "@/lib/rate-limit/keys";
import { SIGN_IN_ACCOUNT_RULES } from "@/lib/rate-limit/rules";
import type { RateLimiter } from "@/lib/rate-limit/types";

/**
 * Verrouillage par compte de la connexion par mot de passe (ADR 0015) : contre le bourrage
 * d'identifiants réparti sur plusieurs IP, que le limiteur par IP ne voit pas. Chaque tentative
 * compte, avant la vérification du mot de passe (atomique : pas de N essais parallèles). Même
 * réponse que l'adresse ait un compte ou non. Le lien magique reste ouvert comme accès de secours.
 */

export const ACCOUNT_LOCKED_CODE = "TOO_MANY_ATTEMPTS";

const SIGN_IN_PATH = "/sign-in/email";
const bodySchema = z.object({ email: z.string() });

export async function checkSignInAccount(
  limiter: RateLimiter,
  body: unknown,
): Promise<void> {
  // Corps invalide : rien à compter, l'endpoint répondra 400.
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return;
  const result = await limiter.consume(
    "sign-in-account",
    normalizeEmail(parsed.data.email),
    SIGN_IN_ACCOUNT_RULES,
  );
  if (result.allowed) return;
  throw new APIError(
    "TOO_MANY_REQUESTS",
    { message: "Too many attempts.", code: ACCOUNT_LOCKED_CODE },
    { "X-Retry-After": String(result.retryAfterSeconds ?? 0) },
  );
}

/**
 * hooks.before : exécuté après le contrôle d'origine en HTTP (un site tiers ne verrouille pas un
 * compte), et aussi pour les appels serveur auth.api.signInEmail.
 */
export function accountLockHook(limiter: RateLimiter) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path === SIGN_IN_PATH) await checkSignInAccount(limiter, ctx.body);
  });
}
