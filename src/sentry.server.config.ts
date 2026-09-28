import * as Sentry from "@sentry/nextjs";

import { getEnv } from "./lib/env";
import { buildSentryOptions } from "./lib/observability/sentry-options";

// Chargé par register() (src/instrumentation.ts) dans le runtime Node. Sans DSN : aucun init.
// La validité du DSN est vérifiée avant, au démarrage (next.config.ts, STARTUP_DOMAINS).
const options = buildSentryOptions({
  dsn: getEnv("sentry").SENTRY_DSN,
  environment: getEnv("core").NODE_ENV,
});

if (options) Sentry.init(options);
