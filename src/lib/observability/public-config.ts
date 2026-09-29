import type { SentryConfigInput } from "./sentry-options";

/**
 * Configuration Sentry lisible côté navigateur. Les valeurs sont figées au build par
 * next.config.ts (compiler.define, depuis publicBuildEnv de src/lib/env.ts) : ce module ne lit
 * aucune variable d'environnement (CLAUDE.md §5). Hors build Next (tests), les identifiants
 * n'existent pas.
 */
export function publicSentryConfig(): SentryConfigInput {
  const dsn =
    typeof __TROUVIO_SENTRY_DSN__ === "undefined" ? "" : __TROUVIO_SENTRY_DSN__;
  const environment =
    typeof __TROUVIO_ENV__ === "undefined" ? "development" : __TROUVIO_ENV__;
  return { dsn: dsn === "" ? undefined : dsn, environment };
}
