---
name: p1-05-headers-review-facts
description: Faits vérifiés en revue P1-05 (2026-10-13) - routes Better Auth 1.7.7 qui rendent un jeton, hooks.after appliqué aux appels serveur, chemins hors matcher du proxy sans CSP
metadata:
  type: project
---

Vérifié le 2026-10-13 (better-auth 1.7.7, next 16.3.8) :
- Jeton de session en JSON : seuls /sign-in/email, /sign-up/email, /magic-link/verify (sans callbackURL), /get-session, /list-sessions, /change-password. /verify-email rend `{status, user:null}` (jamais de jeton). Le strip P1-05 est une liste de chemins : rouvrir /change-password (P7-02) ne serait pas couvert.
- dispatch.mjs : hooks.before/after utilisateur (matcher toujours vrai) s'exécutent AUSSI pour `auth.api.*` côté serveur, avant les hooks des plugins (nextCookies). nextCookies.after appelle `cookies()` de next/headers, aussi depuis le proxy ; erreurs autres que « outside a request scope » relancées.
- Proxy : matcher exclut `api/`, `_next/static/`, `_next/image`, `icon.svg`, `brand/` ; une 404 sous `/brand/...` ou `/_next/...` est une page HTML SANS aucune CSP (ni nonce, ni API_CSP). `/api` exact reçoit les deux CSP (cumul, casse seulement).
- x-request-id : écrasé sur les pages seulement ; sur /api/* la valeur du client atteint Sentry brute (scrubEvent filtre les noms d'en-têtes, pas les valeurs) ; requestLogger valide l'UUID.

**Why:** comportements de bibliothèque et de routage invisibles dans le diff.
**How to apply:** en revue P7-02/P7-04 (réouverture de routes), à l'ajout de fichiers metadata (robots, sitemap, opengraph) ou de routes sous /brand, et à chaque montée de better-auth/next. Voir [[p1-03-authz-review-facts]], [[p1-04-ratelimit-review-facts]].
