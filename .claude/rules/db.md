---
paths:
  - "db/**"
  - "drizzle.config.*"
  - "src/lib/db/**"
  - "src/features/**/queries*"
  - "src/features/**/repo*"
---

# Règles base de données (Drizzle + Neon)

- Consulter le skill `postgres-best-practices` pour index, contraintes et requêtes.
- Schéma unique dans `db/schema.ts`, conforme à `docs/ARCHITECTURE.md` §5. Toute divergence = mise à jour de l'architecture dans la même PR.
- Migrations générées par `pnpm db:generate`, **jamais éditées après commit** (bloqué par hook). Correction = nouvelle migration.
- Migration destructive (DROP, changement de type, NOT NULL sur colonne existante) = plan de retour arrière écrit dans la PR et migration en deux temps (expand → contract).
- Idempotence par contraintes uniques (`source+external_id`, `user_id+offer_id`, `user_id+channel+digest_date`) et `onConflictDoNothing/DoUpdate`.
- Toute requête sur une table à `user_id` prend un `UserId` (type de marque, issu de la session par `requireUser`/`authorizeRoute`, jamais casté) et filtre par `ownedBy(table, userId, …)` de `src/lib/db/owned.ts`, jointures comprises ; insertion par `values({ ...input, userId })`, jamais `userId` dans un `set`. Nouvelle table à `user_id` : l'ajouter à `USER_OWNED_TABLES` et à `seedTwoTenants`, et tester sa matrice IDOR (ADR 0014). Jamais de SQL concaténé (`sql` tagué uniquement).
- Accès à la base réservé à `src/lib/db/**`, à l'instance Better Auth et aux dépôts de domaine (`src/features/<domaine>/repo.ts` ou `queries.ts`) : ailleurs dans `src/`, ESLint refuse schéma, client, `pg` et `drizzle-orm` (liste de fichiers autorisés, ADR 0014).
- Table `users` (possédée par son `id`) : lue ou modifiée seulement par `eq(users.id, currentUser.id)`.
- Tests d'intégration sur Postgres de test isolé (conteneur ou branche Neon dédiée), réinitialisé par suite.
