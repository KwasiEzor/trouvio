---
name: sentry-v11-leak-vectors
description: Faits verifies dans node_modules @sentry/* 11.0.0 (revue P0-06, 2026-09-29) - canaux qui contournent beforeSend, captureRequestError, infer_ip, variables d'env lues par le SDK
metadata:
  type: project
---

Verifie dans le code du SDK 11.0.0 (revue P0-06, 2026-09-29) :
- Navigateur : `infer_ip: "never"` si `dataCollection.userInfo` est false (browser client.js:21) ; les en-tetes UA/Referer passent par `_INTERNAL_filterKeyValueData` (allow = sous-chaine, valeurs filtrees remplacees par "[Filtered]", pas supprimees).
- `browserSessionIntegration` est active par defaut : une enveloppe session par chargement de page, hors beforeSend, avec `attrs.user_agent` et `did` = user.id || user.email || user.username (core session.js:28).
- Aucun garde `enableLogs` en v11 : `Sentry.logger.*` / `Sentry.metrics.*` envoient des qu'appeles, hors beforeSend (seuls beforeSendLog/beforeSendMetric).
- Serveur : `getTracesSampleRate` lit `SENTRY_TRACES_SAMPLE_RATE` et `getClientOptions` lit `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_NAME`, `SENTRY_DEBUG` (node sdk/index.js) hors src/lib/env.ts ; `includeServerName: false` evite le hostname partout (events, logs, metrics).
- `captureRequestError` met `contexts.nextjs.request_path` = `req.url` de Next (chemin + query string, base-server.js:472) ; beforeSend du projet ne le coupait pas a P0-06.
- `sdkProcessingMetadata` (en-tetes bruts, ipAddress) est supprime a la creation de l'enveloppe (core envelope.js:38).

**Why:** ces canaux ne passent pas par scrubEvent ; les re-verifier evite de refaire la lecture du SDK.
**How to apply:** en revue P1-05 (CSP/tunnel, setUser), P3 (genAI), P5 (@sentry/node job), P10-02 (traces), et a chaque montee de version Sentry, re-verifier ces points (le code peut avoir change).
