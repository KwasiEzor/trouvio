import { headers } from "next/headers";
import { cache } from "react";

import { getAuth, type Session } from "./index";

/**
 * Session de la requête en cours, côté serveur (rôle compris), ou null. Mémorisée pour le rendu :
 * plusieurs composants peuvent la lire sans requête de plus. Les contrôles d'accès (requireUser,
 * requireAdmin) arrivent en P1-03.
 */
export const getSession = cache(async (): Promise<Session | null> =>
  getAuth().api.getSession({ headers: await headers() }),
);
