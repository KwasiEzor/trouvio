import { createHmac } from "node:crypto";

import type { RateLimitRule, RateLimitScope } from "./types";

/**
 * Clés des compteurs : HMAC-SHA256 de la portée, de la fenêtre et du sujet (IP, email), pour que la
 * table ne contienne ni IP ni email (SECURITY §4). La contrainte CHECK de rate_limits le garantit
 * en base. Une rotation de BETTER_AUTH_SECRET remet les compteurs à zéro.
 */

const KEY_VERSION = "v1";

/** Clé HMAC propre au limiteur, dérivée du secret d'auth (aucune variable d'environnement de plus). */
export function deriveRateLimitSecret(authSecret: string): string {
  return createHmac("sha256", authSecret)
    .update("trouvio:rate-limit:v1")
    .digest("hex");
}

export function rateLimitKey(
  secret: string,
  scope: RateLimitScope,
  rule: RateLimitRule,
  subject: string,
): string {
  const hmac = createHmac("sha256", secret);
  // Longueur préfixée : aucun découpage différent des mêmes caractères ne donne la même entrée.
  for (const part of [
    KEY_VERSION,
    scope,
    String(rule.windowSeconds),
    subject,
  ]) {
    hmac.update(`${Buffer.byteLength(part)}:${part}`);
  }
  return hmac.digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DOTLESS_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Boîte qui reçoit un email : sans « +tag », et sans points chez Gmail. Pour le plafond par
 * destinataire seulement (les variantes arrivent dans la même boîte) ; jamais pour l'identité.
 */
export function mailboxOf(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at === -1) return normalized;
  const domain = normalized.slice(at + 1);
  let local = normalized.slice(0, at).split("+")[0] ?? "";
  if (DOTLESS_DOMAINS.has(domain)) local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}
