import { assertStartupEnv } from "@/lib/env";

/**
 * Appelé une fois au démarrage du serveur Next (pas pendant `next build`).
 * Une configuration invalide lève une erreur : `next start` s'arrête avant de servir.
 */
export function register(): void {
  assertStartupEnv("web");
}
