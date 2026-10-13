import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { publicSentryConfig } from "./lib/observability/public-config";
import { buildSentryOptions } from "./lib/observability/sentry-options";

// CSP sans unsafe-eval (ADR 0016) : Zod 4 sonde `new Function("")` au premier parse d'un objet pour
// choisir son mode compilé, ce qui produit une violation de CSP (rattrapée, mais signalée). En mode
// jitless, la sonde n'a jamais lieu. Avant toute hydratation : ce fichier s'exécute en premier.
z.config({ jitless: true });

// Navigateur : mêmes options que le serveur (collecte minimale, sans replay ni traces).
const options = buildSentryOptions(publicSentryConfig());

if (options) Sentry.init(options);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
