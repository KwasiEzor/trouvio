/**
 * Politique d'authentification (docs/SECURITY.md §3). Source unique : la configuration de Better
 * Auth (src/lib/auth), les formulaires et les textes des emails lisent ces valeurs.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 100;
// RFC 5321 : longueur maximale d'une adresse.
export const EMAIL_MAX_LENGTH = 254;

export const MAGIC_LINK_TTL_SECONDS = 10 * 60;
export const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
// Une session en cours d'usage est prolongée au plus une fois par jour.
export const SESSION_REFRESH_SECONDS = 24 * 60 * 60;

/** Chemins internes passés en callbackURL : des constantes, jamais une valeur lue dans l'URL. */
export const AUTH_PATHS = {
  signIn: "/connexion",
  signUp: "/inscription",
  afterSignIn: "/fil",
  invalidLink: "/connexion?erreur=lien",
} as const;
