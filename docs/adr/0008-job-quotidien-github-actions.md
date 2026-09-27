# ADR 0008 — Le job quotidien s'exécute dans GitHub Actions en M1
**Statut** : accepté · **Date** : 2026-09 · **Remplace en partie** : ADR 0004

## Contexte
L'ADR 0004 prévoit qu'un workflow GitHub Actions appelle `POST /api/cron/run` sur l'application déployée. Or le jalon M1 (fin P5 : digest Telegram quotidien pour Kwasi) arrive bien avant le déploiement (P10-02). Le PRD précise qu'en M1, « aucun écran n'est obligatoire » : le job n'a besoin ni d'un serveur web, ni d'une URL publique.

## Décision
1. Le job est une fonction `runDailyJob()` (`src/features/jobs/`), indépendante de Next.js, qui reçoit ses dépendances (base, sources, LLM, canaux) par injection.
2. Point d'entrée **CLI** `pnpm job:run` (`scripts/job-run.ts`) : il valide l'environnement via `src/lib/env.ts`, lance `runDailyJob()` et renvoie un code de sortie ≠ 0 en cas d'échec global.
3. En M1, le workflow `daily-job.yml` exécute `pnpm job:run` **dans le runner GitHub Actions**, une fois par jour et à la demande (`workflow_dispatch`).
4. Les secrets (Neon avec le rôle applicatif, Anthropic, sources, Telegram, Sentry) vivent dans un **environnement GitHub `production`** accessible au seul workflow du job, jamais aux PR ni aux forks.
5. Un verrou `pg_advisory_lock` garantit une seule exécution à la fois, quel que soit le point d'entrée.
6. Après le déploiement (P10-05), une route `POST /api/cron/run` appelle la même fonction. On choisit alors de garder le job dans GitHub Actions ou de le basculer sur le serveur ; les deux restent possibles sans réécriture.

## Conséquences
+ M1 atteignable sans serveur, sans Docker, sans coût d'hébergement.
+ Le cœur du job est testable sans HTTP (test d'intégration direct de `runDailyJob()`).
+ Même code en M1 et après déploiement : un seul chemin métier.
− Les secrets de production sont stockés dans GitHub : environnement dédié, revue de chaque modification du workflow (`guard-files` demande confirmation), journaux sans secrets.
− Durée limitée d'un job GitHub Actions (6 h) et quota de minutes du compte gratuit sur dépôt privé : largement suffisants pour un utilisateur, à surveiller à partir de la bêta (P8-02). *Mise à jour : dépôt devenu public (ADR 0009), minutes illimitées sur les runners standard.*
− Planification GitHub parfois décalée de quelques minutes et désactivée après 60 jours sans activité du dépôt (déjà noté dans l'ADR 0004).

## Alternatives écartées
- **Déployer tôt sur le VPS** (P5-00) : oblige à trancher l'ADR 0006 et à administrer un serveur avant d'avoir validé la valeur du produit.
- **Cron sur la machine de Kwasi** : dépend d'une machine allumée ; pas d'historique partagé.
