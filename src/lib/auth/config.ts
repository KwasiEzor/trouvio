import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import {
  existingAccountEmail,
  magicLinkEmail,
  verificationEmail,
} from "@/features/auth/core/emails";
import {
  AUTH_PATHS,
  EMAIL_VERIFICATION_TTL_SECONDS,
  MAGIC_LINK_TTL_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_REFRESH_SECONDS,
  SESSION_TTL_SECONDS,
} from "@/features/auth/core/policy";
import type { Database } from "@/lib/db/client";
import { USER_ROLES } from "@/lib/db/enums";
import type { Logger } from "@/lib/logger";

import { accounts, sessions, users, verifications } from "../../../db/schema";
import { bridge } from "./log-bridge";
import type { AuthMailer } from "./mailer";

/**
 * Configuration de Better Auth (ADR 0003, ADR 0013). Fonction pure de ses dépendances : rien n'est
 * lu dans l'environnement ici (src/lib/auth/index.ts s'en charge, à la première requête).
 */

export type AuthDeps = {
  readonly db: Database;
  /** APP_URL : seule origine acceptée. */
  readonly baseURL: string;
  readonly secret: string;
  readonly mailer: AuthMailer;
  readonly log: Logger;
};

// Routes hors périmètre : profil et compte (P6-05, P7-04), fournisseurs externes (aucun).
const DISABLED_PATHS = [
  "/update-user",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/sign-in/social",
  "/link-social",
  "/unlink-account",
];

export function buildAuthOptions({
  db,
  baseURL,
  secret,
  mailer,
  log,
}: AuthDeps) {
  return {
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    // usePlural sans modelName : les deux ensemble chercheraient « userss ».
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    advanced: {
      database: { generateId: "uuid" },
      // Explicite : Better Auth coupe ce contrôle quand NODE_ENV vaut « test ». Les tests
      // d'intégration vérifient ainsi le comportement de production (origine, callbackURL).
      disableOriginCheck: false,
    },
    user: {
      additionalFields: {
        // input: false : une valeur envoyée à l'inscription est remplacée par le défaut.
        role: {
          type: [...USER_ROLES],
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Aussi la condition d'une réponse identique pour une adresse déjà inscrite.
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      onExistingUserSignUp: async ({ user }) => {
        const signInUrl = new URL(AUTH_PATHS.signIn, baseURL).toString();
        await mailer.send({
          kind: "existing-account",
          to: user.email,
          url: signInUrl,
          ...existingAccountEmail({ signInUrl }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          kind: "verification",
          to: user.email,
          url,
          ...verificationEmail({ url }),
        });
      },
    },
    // cookieCache désactivé (défaut) : une session supprimée ne vaut plus rien, immédiatement.
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_REFRESH_SECONDS,
    },
    databaseHooks: {
      session: {
        create: {
          // Minimisation (SECURITY §4) : le limiteur calcule l'IP à la volée, sans la stocker.
          before: (session) =>
            Promise.resolve({
              data: { ...session, ipAddress: null, userAgent: null },
            }),
        },
      },
    },
    disabledPaths: DISABLED_PATHS,
    logger: { level: "warn", log: bridge(log) },
    telemetry: { enabled: false },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          await mailer.send({
            kind: "magic-link",
            to: email,
            url,
            ...magicLinkEmail({ url }),
          });
        },
      }),
      // Toujours le dernier : pose les cookies des appels faits depuis le serveur.
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}
