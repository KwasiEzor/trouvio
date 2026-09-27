import { setupServer } from "msw/node";

/**
 * Serveur MSW partagé par tous les tests Vitest (démarré dans src/test/setup.ts).
 * Aucun handler par défaut : chaque test déclare les réponses dont il a besoin avec
 * `server.use(...)`, et toute requête non simulée est refusée.
 */
export const server = setupServer();
