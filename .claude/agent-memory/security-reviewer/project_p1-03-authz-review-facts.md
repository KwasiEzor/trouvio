---
name: p1-03-authz-review-facts
description: Faits vérifiés en revue P1-03 (2026-10-08) - contournements des garde-fous ESLint/UserId, routes Better Auth 1.7.7 encore ouvertes, robustesse de disabledPaths
metadata:
  type: project
---

Vérifié le 2026-10-08 (better-auth 1.7.7, better-call 1.4.0, rou3 0.9.2, ESLint 9 + projectService) :
- disabledPaths : comparaison exacte après `new URL().pathname` sans slash final ; le routeur refuse `//`, le slash final non déclaré, ne décode pas `%2D` et respecte la casse. Pas de contournement trouvé. Ne protège pas les appels serveur `auth.api.*`.
- Restent servis sans fonctionnalité : `/verify-password` (oracle de mot de passe pour un porteur de session, `scope: "server"` n'empêche PAS l'appel HTTP, pas de règle spéciale du limiteur), `/change-password` (rend un nouveau jeton si revokeOtherSessions). `/get-session` rend `session.token` en JSON (cookie httpOnly contournable par XSS).
- DATA_ACCESS_PATTERN contourné (mesuré, lint vert + tsc vert) : suffixe `.js` (`@/lib/db/client.js`), `db/./schema`, `import()` dynamique ; fichiers hors globs (`"use server"` dans `src/features/x/server.ts`, `src/lib/**`).
- UserId de marque contourné (tsc vert) : `z.uuid().brand<"UserId">()` recréé (marque structurelle), `await req.json()` (any) passé à ownedBy, alias `UserId as U`, `CurrentUser["id"]`, paramètre de Server Action typé UserId. Pas de règles typescript-eslint type-checked (no-unsafe-argument).
- Sondes : `eslint --stdin --stdin-filename <fichier existant>` (un chemin inexistant échoue au projectService) ; tsc avec un tsconfig du scratchpad qui étend celui du dépôt + lien node_modules.

**Why:** ces vecteurs ne se voient pas dans le diff ; les re-mesurer coûte des sondes.
**How to apply:** en revue P5/P6/P7-04 (premiers dépôts, Server Actions, réouverture de routes Better Auth) et à chaque montée de better-auth, vérifier si ces points ont été corrigés. Voir [[p1-01-db-review-facts]].
