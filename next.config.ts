import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empêche `next dev` d'ajouter un bloc « nextjs-agent-rules » dans CLAUDE.md (mémoire projet versionnée).
  agentRules: false,
  // Ne pas annoncer le framework dans l'en-tête X-Powered-By.
  poweredByHeader: false,
  // Liens et redirections typés : une route inexistante devient une erreur de compilation.
  typedRoutes: true,
};

export default nextConfig;
