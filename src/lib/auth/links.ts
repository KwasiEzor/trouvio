import { verifyJWT } from "better-auth/crypto";

import {
  linkTokenSchema,
  parseMagicLinkRecord,
  verificationPayloadSchema,
} from "@/features/auth/core/links";

import type { Auth } from "./index";
import { magicLinkIdentifier } from "./link-tokens";

/**
 * Aperçus des pages /activation et /connexion/lien (ADR 0017) : lus côté serveur, sans route HTTP,
 * ils ne consomment aucun jeton et n'ouvrent aucune session. L'adresse affichée annonce le compte
 * visé (connexion forcée). findVerificationValue purge au passage les lignes expirées : ce n'est
 * pas une consommation.
 */

export type VerificationPreview =
  | { readonly status: "invalid" }
  | { readonly status: "pending" | "verified"; readonly email: string };

export type MagicLinkPreview =
  | { readonly status: "invalid" }
  | { readonly status: "valid"; readonly email: string };

const INVALID = { status: "invalid" } as const;

export async function previewVerificationLink(
  auth: Auth,
  token: string,
): Promise<VerificationPreview> {
  if (!linkTokenSchema.safeParse(token).success) return INVALID;
  const context = await auth.$context;
  const payload = verificationPayloadSchema.safeParse(
    await verifyJWT(token, context.secret),
  );
  if (!payload.success) return INVALID;
  const found = await context.internalAdapter.findUserByEmail(
    payload.data.email,
  );
  if (found === null) return INVALID;
  return {
    status: found.user.emailVerified ? "verified" : "pending",
    email: found.user.email,
  };
}

export async function previewMagicLink(
  auth: Auth,
  token: string,
): Promise<MagicLinkPreview> {
  if (!linkTokenSchema.safeParse(token).success) return INVALID;
  const context = await auth.$context;
  const stored = await context.internalAdapter.findVerificationValue(
    magicLinkIdentifier(token),
  );
  // findVerificationValue ne contrôle pas l'expiration.
  if (stored === null || stored.expiresAt <= new Date()) return INVALID;
  const record = parseMagicLinkRecord(stored.value);
  if (record === null) return INVALID;
  return { status: "valid", email: record.email.toLowerCase() };
}
