import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./policy";

/**
 * Textes d'interface de l'authentification. Listes fermées : ni le message du serveur ni un
 * paramètre de l'URL ne sont jamais affichés tels quels.
 */

export const FIELD_MESSAGES = {
  invalidEmail: "Adresse email invalide.",
  nameRequired: "Indique ton nom.",
  passwordRequired: "Indique ton mot de passe.",
  passwordTooShort: `${PASSWORD_MIN_LENGTH} caractères au minimum.`,
  tooLong: (max: number) => `${max} caractères au maximum.`,
} as const;

/** Mêmes textes que l'adresse ait un compte ou non : ils ne permettent pas d'énumérer les comptes. */
export const AUTH_NOTICES = {
  signUpSent:
    "Vérifie ta boîte mail. Si cette adresse peut être utilisée, tu y trouveras un lien pour activer ton compte.",
  magicLinkSent:
    "Si cette adresse peut être utilisée, un lien vient d'y être envoyé.",
} as const;

const GENERIC = "Une erreur est survenue. Réessaie dans un instant.";
const RATE_LIMITED = "Trop de tentatives. Réessaie dans un instant.";
const BAD_CREDENTIALS = "Email ou mot de passe incorrect.";
const EXPIRED_LINK = "Ce lien n'est plus valable. Demande-en un nouveau.";

// Codes d'erreur de Better Auth. Email inconnu, compte sans mot de passe et mauvais mot de passe
// partagent un seul texte.
const MESSAGES = new Map<string, string>([
  ["INVALID_EMAIL_OR_PASSWORD", BAD_CREDENTIALS],
  ["INVALID_PASSWORD", BAD_CREDENTIALS],
  ["USER_NOT_FOUND", BAD_CREDENTIALS],
  ["CREDENTIAL_ACCOUNT_NOT_FOUND", BAD_CREDENTIALS],
  [
    "EMAIL_NOT_VERIFIED",
    "Ton adresse n'est pas encore vérifiée. Un nouveau lien vient de t'être envoyé.",
  ],
  ["INVALID_EMAIL", FIELD_MESSAGES.invalidEmail],
  ["PASSWORD_TOO_SHORT", FIELD_MESSAGES.passwordTooShort],
  ["PASSWORD_TOO_LONG", FIELD_MESSAGES.tooLong(PASSWORD_MAX_LENGTH)],
]);

export type AuthErrorLike = {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
};

export function messageForAuthError({ code, status }: AuthErrorLike): string {
  if (status === 429) return RATE_LIMITED;
  return (code === undefined ? undefined : MESSAGES.get(code)) ?? GENERIC;
}

/** Message de /connexion pour le paramètre `erreur` de l'URL. */
export function noticeForQuery(
  erreur: string | readonly string[] | undefined,
): string | undefined {
  return erreur === "lien" ? EXPIRED_LINK : undefined;
}
