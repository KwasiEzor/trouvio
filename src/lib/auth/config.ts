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
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_REFRESH_SECONDS,
  SESSION_TTL_SECONDS,
} from "@/features/auth/core/policy";
import type { Database } from "@/lib/db/client";
import { USER_ROLES } from "@/lib/db/enums";
import type { Logger } from "@/lib/logger";
import { toBetterAuthStorage } from "@/lib/rate-limit/better-auth-storage";
import { AUTH_IP_DEFAULT_RULE, AUTH_IP_RULES } from "@/lib/rate-limit/rules";
import type { RateLimiter } from "@/lib/rate-limit/types";

import { accounts, sessions, users, verifications } from "../../../db/schema";
import { accountLockHook } from "./account-lock";
import { bridge } from "./log-bridge";
import { capRecipients, type AuthMailer } from "./mailer";

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
  /** Limiteur du projet (ADR 0015) : par IP (Better Auth), par compte, par destinataire. */
  readonly rateLimit: {
    readonly enabled: boolean;
    readonly limiter: RateLimiter;
  };
};

// Routes hors périmètre : profil et compte (P6-05, P7-04), fournisseurs externes (aucun),
// réinitialisation du mot de passe (P7-02). Comparaison au chemin exact : /reset-password/:token
// reste servi, mais sans /request-password-reset aucun jeton n'est émis (réponse 400).
// Sessions et comptes (P1-03, Q3) : aucune fonctionnalité ne les sert ; /list-sessions rendrait au
// navigateur les jetons de toutes les sessions. À rouvrir avec leurs tests IDOR (P7-04).
// /change-password (rend un jeton de session) et /verify-password (servie en HTTP malgré son
// scope « server », hors des règles du limiteur : devinette du mot de passe avec un cookie volé)
// attendent P7-02. Les routes servies sont figées par une liste blanche (auth.db.test.ts).
export const DISABLED_PATHS = [
  "/update-user",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/sign-in/social",
  "/link-social",
  "/unlink-account",
  "/request-password-reset",
  "/reset-password",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/update-session",
  "/list-accounts",
  "/account-info",
  "/get-access-token",
  "/refresh-token",
  "/change-password",
  "/verify-password",
];

export function buildAuthOptions({
  db,
  baseURL,
  secret,
  mailer: transport,
  log,
  rateLimit,
}: AuthDeps) {
  const mailer = capRecipients(transport, rateLimit.limiter, log);
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
      // Contrat avec le reverse proxy (ADR 0015) : Caddy écrase x-forwarded-for avec la seule IP du
      // client et le port de l'application n'est pas publié. Pas de trustedProxies (le client
      // choisirait une IP dans la chaîne) ; jamais disableIpTracking (coupe le limiteur).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"], ipv6Subnet: 64 },
    },
    // Limiteur par IP et par chemin, avant la résolution de la route. Remplace les règles
    // intégrées ; compteurs dans Postgres (src/lib/db/rate-limit-store.ts).
    rateLimit: {
      enabled: rateLimit.enabled,
      window: AUTH_IP_DEFAULT_RULE.windowSeconds,
      max: AUTH_IP_DEFAULT_RULE.max,
      customRules: Object.fromEntries(
        Object.entries(AUTH_IP_RULES).map(([path, rule]) => [
          path,
          { window: rule.windowSeconds, max: rule.max },
        ]),
      ),
      customStorage: toBetterAuthStorage(rateLimit.limiter, log),
    },
    hooks: { before: accountLockHook(rateLimit.limiter) },
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
      user: {
        create: {
          // Better Auth ne borne ni le nom ni l'image envoyés par le client (sign-up, lien magique).
          before: (user) =>
            Promise.resolve({
              data: {
                ...user,
                name: user.name.trim().slice(0, NAME_MAX_LENGTH),
                image: null,
              },
            }),
        },
      },
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
