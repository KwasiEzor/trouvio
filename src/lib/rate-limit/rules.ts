import type { RateLimitRule } from "./types";

/**
 * Seuils de limitation (ADR 0015), pour 20 à 50 testeurs ; à revoir avec les métriques réelles
 * (P10-01). Fenêtres longues : elles bornent le volume d'une IP sur la journée.
 */

/** Toute route d'auth sans règle propre. */
export const AUTH_IP_DEFAULT_RULE: RateLimitRule = {
  windowSeconds: 10,
  max: 100,
};

/** Par IP, au chemin exact (remplacent les règles intégrées de Better Auth). */
export const AUTH_IP_RULES = {
  "/sign-in/email": { windowSeconds: 300, max: 10 },
  "/sign-up/email": { windowSeconds: 600, max: 5 },
  "/sign-in/magic-link": { windowSeconds: 600, max: 5 },
  "/send-verification-email": { windowSeconds: 600, max: 3 },
  "/magic-link/verify": { windowSeconds: 60, max: 5 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Chemins servis comptés chacun à part. Tout autre chemin (paramétré, inconnu, inventé) tombe dans
 * un seau commun par IP : le limiteur de Better Auth tourne avant la résolution de la route, et
 * chaque chemin inventé créerait sinon son compteur.
 */
export const RATE_LIMITED_PATHS: readonly string[] = [
  ...Object.keys(AUTH_IP_RULES),
  "/error",
  "/ok",
  "/sign-out",
  "/verify-email",
];

export const OTHER_PATH_BUCKET = "autre";

/** Connexion par mot de passe, par email visé (bourrage d'identifiants réparti sur plusieurs IP). */
export const SIGN_IN_ACCOUNT_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 900, max: 10 },
  { windowSeconds: 86_400, max: 30 },
];

/** Emails d'authentification, par destinataire, tous types confondus (harcèlement, coût). */
export const EMAIL_RECIPIENT_RULES: readonly RateLimitRule[] = [
  { windowSeconds: 900, max: 3 },
  { windowSeconds: 86_400, max: 10 },
];
