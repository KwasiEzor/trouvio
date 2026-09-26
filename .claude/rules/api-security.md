---
paths:
  - "src/app/api/**"
  - "src/app/**/actions.ts"
  - "src/**/*.action.ts"
  - "src/lib/auth/**"
  - "src/lib/rate-limit/**"
  - "src/middleware.ts"
---

# Règles routes API, Server Actions et auth

- Première ligne de chaque route/action : authentification (`requireUser`/`requireAdmin`) **puis** vérification d'appartenance de la ressource.
- Entrées (params, query, body) validées par Zod ; erreurs renvoyées sans détail interne.
- Route publique (auth, contact, webhooks) = rate limiting + test de dépassement (429).
- `/api/cron/run` : Bearer `CRON_SECRET` comparé à temps constant, verrou anti-exécution concurrente (409).
- Webhooks : signature vérifiée, traitement idempotent.
- Jamais d'email, token, contenu de profil dans les logs ; identifiants pseudonymes.
- Chaque route ajoute des tests négatifs : non authentifié, autre utilisateur (IDOR), entrée invalide.
- Checklist `docs/SECURITY.md` §5 obligatoire ; faire passer le sous-agent `security-reviewer`.
