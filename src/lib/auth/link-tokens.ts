import { createHash } from "node:crypto";

/**
 * Identifiant en base d'un jeton de lien magique, au format du plugin magic-link de Better Auth
 * (storeToken: "hashed") : « magic-link: » + SHA-256 en base64url sans remplissage. Un changement
 * de format à une montée de version fait échouer links.db.test.ts (accord sur le hachage).
 */
export function magicLinkIdentifier(token: string): string {
  return `magic-link:${createHash("sha256").update(token).digest("base64url")}`;
}
