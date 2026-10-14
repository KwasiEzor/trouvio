import type { Auth } from "./index";

/**
 * Prolongation de session (P1-05, ADR 0016). Lecture serveur de la session (auth.api.getSession,
 * hors du handler HTTP : ni limiteur, ni /get-session) qui rend les lignes Set-Cookie produites :
 * cookie prolongé (au plus une fois par jour, updateAge), ou cookie d'effacement d'une session
 * expirée. src/proxy.ts les recopie sur la réponse d'un chargement de document : un Server
 * Component ne peut pas écrire de cookie, la prolongation y restait sans effet côté navigateur.
 *
 * Une panne de lecture remonte : l'appelant décide (le proxy la journalise et laisse la page
 * échouer fermé). Ne décide jamais d'un accès.
 */
export async function refreshSession(
  auth: Auth,
  headers: Headers,
): Promise<readonly string[]> {
  const result = await auth.api.getSession({ headers, returnHeaders: true });
  return result.headers.getSetCookie();
}
