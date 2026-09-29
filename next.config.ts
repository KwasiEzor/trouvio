import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

import { assertStartupEnv, publicBuildEnv } from "./src/lib/env";

const nextConfig: NextConfig = {
  // Empêche `next dev` d'ajouter un bloc « nextjs-agent-rules » dans CLAUDE.md (mémoire projet versionnée).
  agentRules: false,
  // Ne pas annoncer le framework dans l'en-tête X-Powered-By.
  poweredByHeader: false,
  // Liens et redirections typés : une route inexistante devient une erreur de compilation.
  typedRoutes: true,
  // Aucune source map servie au navigateur. L'envoi à Sentry (sans publication) viendra en P10-02.
  productionBrowserSourceMaps: false,
};

function config(phase: string): NextConfig {
  // Démarrage d'un serveur (next start, next dev) : configuration invalide = arrêt avant de servir.
  // Le build n'est pas concerné : il ne doit exiger aucun secret.
  if (phase === PHASE_PRODUCTION_SERVER || phase === PHASE_DEVELOPMENT_SERVER) {
    assertStartupEnv("web");
  }
  // Seules valeurs publiées dans le bundle navigateur (lues par src/lib/observability/public-config.ts).
  const { NODE_ENV, SENTRY_DSN } = publicBuildEnv();
  return {
    ...nextConfig,
    compiler: {
      // Next applique lui-même JSON.stringify à chaque valeur (serializeDefineEnv, webpack comme
      // Turbopack) : passer la valeur brute, sinon le DSN garderait ses guillemets.
      define: {
        __TROUVIO_SENTRY_DSN__: SENTRY_DSN ?? "",
        __TROUVIO_ENV__: NODE_ENV,
      },
    },
  };
}

// ADR 0010 : aucun jeton ni upload au build (les PR se construisent sans secret), aucune
// télémétrie, pas d'instrumentation de build ni de manifeste des routes dans le bundle client
// (utiles seulement aux traces, désactivées).
export default withSentryConfig(config, {
  sourcemaps: { disable: true },
  telemetry: false,
  silent: true,
  buildTimeInstrumentation: false,
  routeManifestInjection: false,
});
