/**
 * Nature d'une URL de base de données, sans jamais en citer l'hôte ni les identifiants : les
 * journaux et les messages d'erreur disent seulement « base locale » ou « base distante ».
 *
 * Lecture alignée sur celle du pilote (pg-connection-string) : un paramètre host remplace
 * l'hôte de l'URL, et la dernière occurrence d'un paramètre l'emporte. Dans le doute, l'URL est
 * considérée comme distante.
 */

// Une adresse IPv6 garde ses crochets dans URL.hostname.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Paramètres qui désignent un autre hôte que celui de l'URL.
const HOST_PARAMS = new Set(["host", "hostaddr"]);
// pg réencode une URL qui contient une espace ou un % isolé avant de la lire : sa lecture
// pourrait alors différer de celle de new URL().
const REENCODED_BY_PG = / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i;

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** Vrai si l'URL vise la machine locale ; une URL illisible ou ambiguë est considérée distante. */
export function isLoopbackUrl(url: string): boolean {
  const parsed = parse(url);
  if (!parsed || REENCODED_BY_PG.test(url)) return false;
  const params = [...parsed.searchParams.keys()];
  if (params.some((name) => HOST_PARAMS.has(name.toLowerCase()))) return false;
  // postgres: n'est pas un schéma « spécial » du standard URL : l'hôte n'y est pas mis en minuscules.
  return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
}

/** sslmode que pg appliquera : la dernière occurrence du paramètre, s'il y en a une. */
export function effectiveSslMode(url: string): string | undefined {
  return parse(url)?.searchParams.getAll("sslmode").at(-1);
}

export type TargetDescription = "base locale" | "base distante";

export function describeTarget(url: string): TargetDescription {
  return isLoopbackUrl(url) ? "base locale" : "base distante";
}
