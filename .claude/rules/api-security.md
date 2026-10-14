---
paths:
  - "src/app/api/**"
  - "src/app/**/actions.ts"
  - "src/**/*.action.ts"
  - "src/lib/auth/**"
  - "src/lib/rate-limit/**"
  - "src/proxy.ts"
---

# Règles routes API, Server Actions et auth

- Première ligne de chaque page/action : `requireUser()` ou `requireAdmin()` ; de chaque Route Handler : `authorizeRoute("user" | "admin")` (`src/lib/auth/guards.ts`), hors de tout `try/catch` (sinon `unstable_rethrow`). Puis vérification d'appartenance par un dépôt scopé (`ownedBy`). Un layout ne suffit jamais : chaque page et chaque action se protège. `src/proxy.ts` (ADR 0016) pose la CSP à nonce et le `requestId` et prolonge la session : il ne décide **jamais** d'un accès. Session lue côté serveur uniquement (`/get-session` fermée, `authClient.useSession`/`getSession` refusés par ESLint).
- Ids de ressource reçus du client validés par `resourceIdSchema` ; jamais d'`userId` lu dans la requête. Côté serveur, ne jamais appeler `auth.api.*` avec un `userId` venu du client (Better Auth l'honore sans session).
- Entrées (params, query, body) validées par Zod ; erreurs renvoyées sans détail interne.
- Route publique (auth, contact, webhooks) = rate limiting + test de dépassement (429) (ADR 0015) : IP par `getIP` de `better-auth/api` avec les options `advanced.ipAddress` de `src/lib/auth/config.ts` (jamais `disableIpTracking` ni `trustedProxies`), compteur par `RateLimiter` de `src/lib/rate-limit/` (nouvelle portée et règles dans `rules.ts`, sujet jamais journalisé). Un email envoyé à une adresse saisie passe par un plafond par destinataire.
- `/api/cron/run` : Bearer `CRON_SECRET` comparé à temps constant, verrou anti-exécution concurrente (409).
- Webhooks : signature vérifiée, traitement idempotent.
- Jamais d'email, token, contenu de profil dans les logs ; identifiants pseudonymes. Journaliser via `@/lib/logger` ; `logger.error` signale à Sentry (journaliser OU relancer, pas les deux). Jamais d'import direct de `@sentry/*` hors des points d'intégration (ESLint) ; `Sentry.setUser({ id })` uniquement, jamais d'email.
- Chaque route ajoute des tests négatifs : non authentifié, autre utilisateur (IDOR), entrée invalide.
- Checklist `docs/SECURITY.md` §5 obligatoire ; faire passer le sous-agent `security-reviewer`.
