import { z } from "zod";

import { AUTH_PATHS, PASSWORD_MAX_LENGTH } from "./policy";

/**
 * Liens d'authentification envoyés par email (ADR 0017). Ils mènent à une page de l'application en
 * lecture seule ; seul un clic (POST) les consomme. Jamais vers /api/auth : un GET n'y fait rien.
 */

// Formats exacts : un jeton inventé est refusé sans lecture en base (pages anonymes).
/** JWT d'activation : trois segments base64url. */
export const verificationTokenSchema = z
  .string()
  .max(2048)
  .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/);

/** Jeton du lien magique : 32 lettres (generateRandomString(32, "a-z", "A-Z") de Better Auth). */
export const magicLinkTokenSchema = z.string().regex(/^[A-Za-z]{32}$/);

export const confirmVerificationBodySchema = z.object({
  token: verificationTokenSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const confirmMagicLinkBodySchema = z.object({
  token: magicLinkTokenSchema,
});

/**
 * Charge utile du JWT d'activation. Strict : un jeton de changement d'adresse (updateTo,
 * requestType) n'active jamais un compte.
 */
export const verificationPayloadSchema = z.strictObject({
  email: z.email(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

/** Enregistrement stocké par le plugin magic-link de Better Auth (même schéma strict). */
export const magicLinkRecordSchema = z.strictObject({
  type: z.literal("magic-link"),
  email: z.email(),
  name: z.string().optional(),
});

export type MagicLinkRecord = z.infer<typeof magicLinkRecordSchema>;

/** Valeur stockée en base (JSON), ou null si elle n'a pas la forme attendue. */
export function parseMagicLinkRecord(value: string): MagicLinkRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const record = magicLinkRecordSchema.safeParse(parsed);
  return record.success ? record.data : null;
}

function pageUrl(appUrl: string, path: string, token: string): string {
  const url = new URL(path, appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function activationUrl(appUrl: string, token: string): string {
  return pageUrl(appUrl, AUTH_PATHS.activate, token);
}

export function magicLinkUrl(appUrl: string, token: string): string {
  return pageUrl(appUrl, AUTH_PATHS.magicLink, token);
}
