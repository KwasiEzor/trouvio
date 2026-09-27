import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

import { assertStartupEnv } from "./src/lib/env";

const nextConfig: NextConfig = {
  // Empêche `next dev` d'ajouter un bloc « nextjs-agent-rules » dans CLAUDE.md (mémoire projet versionnée).
  agentRules: false,
  // Ne pas annoncer le framework dans l'en-tête X-Powered-By.
  poweredByHeader: false,
  // Liens et redirections typés : une route inexistante devient une erreur de compilation.
  typedRoutes: true,
};

export default function config(phase: string): NextConfig {
  // Démarrage d'un serveur (next start, next dev) : configuration invalide = arrêt avant de servir.
  // Le build n'est pas concerné : il ne doit exiger aucun secret.
  if (phase === PHASE_PRODUCTION_SERVER || phase === PHASE_DEVELOPMENT_SERVER) {
    assertStartupEnv("web");
  }
  return nextConfig;
}
