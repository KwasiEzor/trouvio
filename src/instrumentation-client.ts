import * as Sentry from "@sentry/nextjs";

import { publicSentryConfig } from "./lib/observability/public-config";
import { buildSentryOptions } from "./lib/observability/sentry-options";

// Navigateur : mêmes options que le serveur (collecte minimale, sans replay ni traces).
const options = buildSentryOptions(publicSentryConfig());

if (options) Sentry.init(options);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
