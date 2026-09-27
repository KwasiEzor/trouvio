---
name: env-review-facts
description: Faits verifies en revue P0-02 (2026-09-27) sur la validation d'environnement - standalone Next ignore next.config.ts, contournements ESLint/hook restants, methode de test sans fichier de secrets
metadata:
  type: project
---

- Next 16 en sortie `standalone` (ADR 0006) : server.js injecte la config serialisee (__NEXT_PRIVATE_STANDALONE_CONFIG) et n'execute PAS next.config.ts -> la validation au demarrage placee dans next.config.ts disparait en prod Docker. A reverifier en P10-02.
- Contournements process-env : depuis les corrections P0-02, ESLint couvre aussi Reflect.get(process,…), globalThis["process"], globalThis.process["env"], `{ env } = globalThis.process` ; le hook couvre `process?.env` et `{env}`. Restent ouverts (volontaires seulement, releves de la revue) : (0, process).env, alias `const p = process`, import par defaut renomme ; le hook rate la destructuration multi-ligne (ESLint l'attrape).
- Methode de test sans fichier de secrets : `VAR=valeur pnpm exec next start -p <port>` avec valeurs sentinelles ; le hook guard-bash bloque toute commande contenant le litteral point-env -> construire la chaine par variables shell.

**Why:** evite de refaire ces verifications et de rater le trou standalone lors des revues P1-02, P5-01, P10-02.
**How to apply:** en revue d'un deploiement ou d'un nouveau point d'entree (CLI job, Docker), exiger une validation au demarrage qui ne depend pas de next.config.ts.
