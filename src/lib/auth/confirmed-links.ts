import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { verifyJWT } from "better-auth/crypto";
import { revokeUnprovenAccountAccess } from "better-auth/db";

import {
  confirmMagicLinkBodySchema,
  confirmVerificationBodySchema,
  parseMagicLinkRecord,
  verificationPayloadSchema,
} from "@/features/auth/core/links";
import type { RateLimiter } from "@/lib/rate-limit/types";

import { checkSignInAccount } from "./account-lock";
import { magicLinkIdentifier } from "./link-tokens";

/**
 * Liens d'email consommés par un clic (P1-06, ADR 0017). Les GET de Better Auth (/verify-email,
 * /magic-link/verify) sont fermés : un scanner d'emails ou une page tierce n'ouvre plus de session.
 * Endpoints de plugin : contrôle d'origine, limiteur (AUTH_IP_RULES) et hooks s'appliquent.
 * formCsrfMiddleware couvre la première connexion, sans cookie (Fetch Metadata, Origin, Referer).
 *
 * Invariant : un compte vérifié ne porte qu'un mot de passe connu du titulaire de la boîte.
 */

function invalidToken(): APIError {
  return new APIError("BAD_REQUEST", {
    message: "Invalid or expired link.",
    code: "INVALID_TOKEN",
  });
}

function invalidPassword(): APIError {
  return new APIError("UNAUTHORIZED", {
    message: "Invalid password.",
    code: "INVALID_PASSWORD",
  });
}

export function confirmedLinks({
  limiter,
}: {
  limiter: RateLimiter;
}): BetterAuthPlugin {
  return {
    id: "confirmed-links",
    endpoints: {
      /**
       * Activation : le jeton prouve l'accès à la boîte, le mot de passe prouve que le compte a été
       * créé par son titulaire. Sans les deux, le compte reste non vérifié (pré-détournement, I1).
       */
      confirmEmailVerification: createAuthEndpoint(
        "/verify-email/confirm",
        {
          method: "POST",
          body: confirmVerificationBodySchema,
          use: [formCsrfMiddleware],
          metadata: { noStore: true },
        },
        async (ctx) => {
          const payload = verificationPayloadSchema.safeParse(
            await verifyJWT(ctx.body.token, ctx.context.secret),
          );
          if (!payload.success) throw invalidToken();
          const found = await ctx.context.internalAdapter.findUserByEmail(
            payload.data.email,
          );
          if (found === null) throw invalidToken();
          // Avant le mot de passe : un jeton rejoué ne sert pas d'oracle sur un compte actif.
          if (found.user.emailVerified) {
            throw new APIError("BAD_REQUEST", {
              message: "Email already verified.",
              code: "EMAIL_ALREADY_VERIFIED",
            });
          }
          // Même seau que /sign-in/email : un devineur ne double pas son budget.
          await checkSignInAccount(limiter, { email: payload.data.email });

          const account =
            await ctx.context.internalAdapter.findCredentialAccount(
              found.user.id,
            );
          if (!account?.password) {
            // Temps de réponse comparable à un mauvais mot de passe.
            await ctx.context.password.hash(ctx.body.password);
            throw invalidPassword();
          }
          const valid = await ctx.context.password.verify({
            hash: account.password,
            password: ctx.body.password,
          });
          if (!valid) throw invalidPassword();

          const user = await ctx.context.internalAdapter.updateUser(
            found.user.id,
            { emailVerified: true },
          );
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: true });
        },
      ),

      /**
       * Lien magique : recopie de /magic-link/verify (better-auth 1.7.7, plugins/magic-link l. 170-206)
       * sur le modèle d'email-otp. Le jeton est émis par /sign-in/magic-link, inchangé.
       */
      confirmMagicLink: createAuthEndpoint(
        "/magic-link/confirm",
        {
          method: "POST",
          body: confirmMagicLinkBodySchema,
          use: [formCsrfMiddleware],
          metadata: { noStore: true },
        },
        async (ctx) => {
          // Atomique, expiration comprise : deux clics simultanés n'ouvrent qu'une session.
          const consumed =
            await ctx.context.internalAdapter.consumeVerificationValue(
              magicLinkIdentifier(ctx.body.token),
            );
          if (consumed === null) throw invalidToken();
          const record = parseMagicLinkRecord(consumed.value);
          if (record === null) throw invalidToken();
          const { email, name } = record;

          let user = (await ctx.context.internalAdapter.findUserByEmail(email))
            ?.user;
          // Le hook user.create.before borne le nom.
          user ??= await ctx.context.internalAdapter.createUser(
            { email, emailVerified: true, name: name ?? "" },
            { method: "magic-link" },
          );
          if (!user.emailVerified) {
            // Retire mots de passe et sessions posés avant la preuve de la boîte (pré-détournement).
            const promoted = await revokeUnprovenAccountAccess(ctx, user.id);
            if (promoted === null) throw invalidToken();
            user = promoted;
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
