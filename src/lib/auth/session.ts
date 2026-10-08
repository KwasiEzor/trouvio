import { headers } from "next/headers";
import { cache } from "react";

import { getAuth, type Session } from "./index";

/**
 * Session de la requête en cours, côté serveur (rôle compris), ou null. Mémorisée pour le rendu :
 * plusieurs composants peuvent la lire sans requête de plus. Les contrôles d'accès passent par
 * src/lib/auth/guards.ts (requireUser, requireAdmin, authorizeRoute).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // headers() d'abord : au build, c'est lui qui rend la page dynamique. getAuth() avant lui lirait
  // DATABASE_URL et ferait échouer le pré-rendu.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});
