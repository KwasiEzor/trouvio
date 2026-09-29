---
name: sentry-logging-facts
description: Faits verifies (2026-09-28, plan P0-06) sur Sentry v11 (@sentry/nextjs), dataCollection permissif, sources maps Turbopack, compiler.define de Next 16, pino, logs publics des Actions - a reutiliser pour P1-05, P3, P5, P10
metadata:
  type: project
---

- @sentry/nextjs 11.0.0 publie le 2026-09-23 (10.75.3 = derniere v10). Peer next ^14||^15||^16, react 17-19, Node >=22.12 sur la ligne 22. Installation sonde : +84 paquets, AUCUN script d'installation (v11 n'utilise plus @sentry/cli, qui a un postinstall ; remplace par le paquet npm `sentry` 0.44, nom repris de 2011, licence FSL-1.1-Apache-2.0).
- v11 : `withSentryConfig` s'importe de "@sentry/nextjs/config" ; accepte une config fonction. `sendDefaultPii` SUPPRIME, remplace par `dataCollection` dont les defauts sont PERMISSIFS (userInfo, cookies, en-tetes, corps HTTP, genAI inputs/outputs, databaseQueryData, stackFrameVariables = true). Toujours poser dataCollection explicitement. Span streaming par defaut ; tracesSampleRate absent = pas de traces.
- Turbopack : withSentryConfig force `productionBrowserSourceMaps = true` + suppression apres upload, sauf `sourcemaps.disable: true` ou valeur explicite dans la config Next. Sans jeton : ne pas compter sur la suppression.
- @sentry/node lit `process.env.SENTRY_DSN` implicitement si `dsn` absent : toujours passer dsn explicitement ou ne pas appeler init.
- Porteur global Sentry indexe par SDK_VERSION : importer captureException de @sentry/core n'atteint le client que si @sentry/core a EXACTEMENT la version du SDK initialise.
- Next 16.3 : `compiler.define` / `compiler.defineServer` existent (remplacement a la compilation) -> exposer une valeur au client sans process.env dans src/.
- pino 10.3 : 11 dependances, thread-stream ; pino/thread-stream dans serverExternalPackages de Next ; redaction par chemins (pas de cle a toute profondeur).
- Depot PUBLIC : les journaux des workflows GitHub Actions sont lisibles par tous -> le job quotidien (P5) ne doit rien journaliser d'identifiant utilisateur en clair.
- Plan gratuit Sentry (sept. 2026) : 5k erreurs, 5M spans, 50 replays, 5 Go logs, 1 utilisateur, 30 j.

**Why:** verifie en planifiant P0-06 (registre npm, installation sonde, MIGRATION.md, types de @sentry/core 11, docs nextjs.org).
**How to apply:** P1-05 (CSP : connect-src ingest ou tunnelRoute fixe), P3 (genAI jamais collecte), P5 (Sentry @sentry/node meme version exacte, flush avant sortie, logs Actions publics), P10-02 (upload des source maps avec jeton de build). Voir [[env-and-runtime-facts]], [[github-ci-facts]].
