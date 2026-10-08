import { z } from "zod";

import { FIELD_MESSAGES } from "./messages";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./policy";

/**
 * Schémas des formulaires d'authentification : retour immédiat dans le navigateur. Côté serveur,
 * Better Auth borne le mot de passe ; le nom est coupé et l'image ignorée par un hook
 * (src/lib/auth/config.ts).
 */

const { invalidEmail, nameRequired, passwordRequired, passwordTooShort } =
  FIELD_MESSAGES;
const tooLong = FIELD_MESSAGES.tooLong;

const email = z
  .string(invalidEmail)
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, invalidEmail)
  .pipe(z.email(invalidEmail));

const name = z
  .string(nameRequired)
  .trim()
  .min(1, nameRequired)
  .max(NAME_MAX_LENGTH, tooLong(NAME_MAX_LENGTH));

// Jamais retouché : un espace en début ou en fin fait partie du mot de passe.
const newPassword = z
  .string(passwordRequired)
  .min(PASSWORD_MIN_LENGTH, passwordTooShort)
  .max(PASSWORD_MAX_LENGTH, tooLong(PASSWORD_MAX_LENGTH));

// À la connexion, seule la borne haute est vérifiée : la politique a pu changer depuis l'inscription.
const currentPassword = z
  .string(passwordRequired)
  .min(1, passwordRequired)
  .max(PASSWORD_MAX_LENGTH, tooLong(PASSWORD_MAX_LENGTH));

export const signUpSchema = z.strictObject({
  name,
  email,
  password: newPassword,
});
export const signInSchema = z.strictObject({
  email,
  password: currentPassword,
});
export const magicLinkSchema = z.strictObject({ email });

export type SignUpInput = z.output<typeof signUpSchema>;
export type SignInInput = z.output<typeof signInSchema>;
export type MagicLinkInput = z.output<typeof magicLinkSchema>;
