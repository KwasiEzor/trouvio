import { verifyJWT } from "better-auth/crypto";

import {
  magicLinkTokenSchema,
  parseMagicLinkRecord,
  verificationPayloadSchema,
  verificationTokenSchema,
} from "@/features/auth/core/links";

import type { Auth } from "./index";
import { magicLinkIdentifier } from "./link-tokens";

/**
 * Aperçus des pages /activation et /connexion/lien (ADR 0017) : lus côté serveur, sans route HTTP,
 * ils ne consomment aucun jeton et n'ouvrent aucune session. L'adresse affichée annonce le compte
 * visé (connexion forcée). Le lien magique se lit par l'adaptateur, sur l'index : pas de
 * findVerificationValue, qui purgerait toute la table à chaque GET anonyme.
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
  if (!verificationTokenSchema.safeParse(token).success) return INVALID;
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
  if (!magicLinkTokenSchema.safeParse(token).success) return INVALID;
  const context = await auth.$context;
  const stored = await context.adapter.findOne<{
    value: string;
    expiresAt: Date;
  }>({
    model: "verification",
    where: [{ field: "identifier", value: magicLinkIdentifier(token) }],
  });
  if (stored === null || stored.expiresAt <= new Date()) return INVALID;
  const record = parseMagicLinkRecord(stored.value);
  if (record === null) return INVALID;
  return { status: "valid", email: record.email.toLowerCase() };
}
