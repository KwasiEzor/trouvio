# ADR 0002 — Neon Postgres + Drizzle ORM (driver node-postgres)
**Statut** : accepté

## Contexte
Besoin d'un Postgres managé gratuit au démarrage, de migrations versionnées et d'un typage fort. L'application tourne sur un serveur persistant (VPS), pas en serverless.

## Décision
**Neon** comme base, **Drizzle ORM** pour le schéma et les migrations, driver **`node-postgres` (pg)** avec pool de connexions.

## Conséquences
+ Palier gratuit Neon, branches de base pour tester des migrations.
+ Drizzle : SQL lisible, types inférés, migrations en fichiers versionnés.
+ `pg` fonctionne aussi avec un Postgres local/CI (conteneur) → tests d'intégration identiques à la production.
− Pas de driver HTTP serverless (inutile sur VPS).

## Alternatives écartées
Supabase (plus de fonctionnalités que nécessaire, couplage) ; Prisma (moteur plus lourd, migrations moins transparentes).
