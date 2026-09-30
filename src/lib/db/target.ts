/**
 * Nature d'une URL de base de données, sans jamais en citer l'hôte ni les identifiants : les
 * journaux et les messages d'erreur disent seulement « base locale » ou « base distante ».
 */

// Une adresse IPv6 garde ses crochets dans URL.hostname.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Vrai si l'URL vise la machine locale ; une URL illisible est considérée comme distante. */
export function isLoopbackUrl(url: string): boolean {
  try {
    // postgres: n'est pas un schéma « spécial » du standard URL : l'hôte n'y est pas mis en minuscules.
    return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type TargetDescription = "base locale" | "base distante";

export function describeTarget(url: string): TargetDescription {
  return isLoopbackUrl(url) ? "base locale" : "base distante";
}
