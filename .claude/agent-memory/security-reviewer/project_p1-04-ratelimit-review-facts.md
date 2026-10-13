---
name: p1-04-ratelimit-review-facts
description: Faits vérifiés en revue P1-04 (2026-10-13) - ordre du pipeline Better Auth 1.7.7, getIP, x-forwarded-for de Next 16, verrou par compte + plafond destinataire = verrouillage total par un tiers
metadata:
  type: project
---

Vérifié le 2026-10-13 (better-auth 1.7.7, better-call 1.4.0, next 16.3.8) :
- Ordre HTTP : `onRequest` (disabledPaths, puis limiteur `onRequestRateLimit`, clé `ip|chemin normalisé` sans slash final ni query) → `getBody` → `originCheckMiddleware` du routeur (origine contrôlée SEULEMENT si cookie présent ; callbackURL toujours) → `hooks.before` (dispatch.mjs) → `use: [formCsrfMiddleware]` de l'endpoint (contrôle d'origine sans cookie) → handler. Donc hooks.before passe avant le contrôle d'origine pour un POST sans cookie (formulaire urlencoded cross-site accepté par /sign-in/email).
- `getIP` (@better-auth/core utils/ip.mjs) : sans trustedProxies, une seule valeur de XFF acceptée, sinon null → clé `no-trusted-ip` en prod, `127.0.0.1` si NODE_ENV dev/test OU variable `TEST` truthy. Warn « could not determine a client IP » une seule fois par processus.
- Next 16.3.8 base-server.js:612 : `x-forwarded-for ??= socket.remoteAddress` → XFF client conservé ; port applicatif exposé = IP au choix.
- Règles spéciales intégrées (`/sign-in*`, `/sign-up*` 10 s / 3) s'appliquent aux chemins inventés ramenés au seau « autre » du projet et partagent sa clé (même fenêtre 10 s que la règle par défaut).
- Better Auth : sign-in fait `email.toLowerCase()` après `z.email()` ; lien magique n'abaisse pas la casse ; plus-addressing non normalisé nulle part.
- Constat ouvert à la revue : verrou par compte (30/24 h, succès compris) + plafond destinataire (10/24 h, silencieux) = un tiers coupe mot de passe ET lien magique ~40 requêtes/jour depuis une IP ; chaque requête /api/auth/* (refus compris) = un upsert Postgres sur ligne chaude, pool de 10.

**Why:** comportements de bibliothèque non visibles dans le diff, coûteux à retrouver.
**How to apply:** en revue P4-03 (Resend, plafond global), P7-01/P7-02 (nouvelles routes publiques, réouverture reset/change-password), P10-02 (contrat Caddy, IPv6 Docker) et à chaque montée de better-auth/next. Voir [[p1-03-authz-review-facts]].
