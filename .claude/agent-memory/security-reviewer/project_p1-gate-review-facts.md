---
name: p1-gate-review-facts
description: Faits vérifiés à la porte P1 (2026-10-14) - oracle de /send-verification-email si le transport lève, exp optionnel du JWT d'activation, denyWrite du seed toujours absent, audit prod
metadata:
  type: project
---

Vérifié le 2026-10-14 (better-auth 1.7.7, HEAD 4e8cd6f), porte P1 franchissable (aucun bloquant) :
- `/send-verification-email` sans session : plancher de 500 ms, mais `sendVerificationEmailFn` est appelé dans un try/catch qui RELANCE l'erreur → transport en échec = 500 pour un compte non vérifié existant, 200 sinon (oracle). `runInBackgroundOrAwait` (sign-up, onExistingUserSignUp) avale les erreurs, lui. capRecipients saute en silence (bon).
- `verifyJWT` = jose `jwtVerify` sans `algorithms` ni exigence d'`exp` ; `signJWT` met toujours `exp`. `verificationPayloadSchema` (strict) garde `exp` optionnel.
- `.claude/settings.json` : `db/seed.local.json` en denyRead + Read deny, PAS en denyWrite (consigné dans P1-01.md l. 543 sans tâche cible). Fichier ignoré par git : réécriture invisible → promotion admin d'une adresse tierce au prochain `db:seed:neon`.
- `pnpm audit --prod` : 1 modérée esbuild ≤0.24.2 via better-auth > drizzle-kit (serveur de dev esbuild, non utilisé).
- x-request-id hors pages désormais validé UUID dans scrubEvent ([[p1-05-headers-review-facts]] levé sur ce point) ; STATIC_CSP couvre /brand/* et /_next/* (404 comprises).

**Why:** points non visibles dans le diff, utiles à P4-03 (Resend), P7-02, P10-01/02.
**How to apply:** en P4-03 vérifier qu'un échec de transport ne change pas la réponse de /send-verification-email ; en revue des réglages Claude, vérifier denyWrite du seed. Voir [[p1-06-links-review-facts]].
