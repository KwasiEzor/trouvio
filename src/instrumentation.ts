import * as Sentry from "@sentry/nextjs";

import { isNodeRuntime } from "./lib/env";

// Runtime Node uniquement (ADR 0010) : aucune route edge ; une route edge ne serait pas surveillée.
export async function register(): Promise<void> {
  if (isNodeRuntime()) await import("./sentry.server.config");
}

// Erreurs des Server Components, route handlers et server actions.
export const onRequestError = Sentry.captureRequestError;
