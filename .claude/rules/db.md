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
- Toute requête sur une table à `user_id` prend `userId` en paramètre obligatoire issu de la session. Jamais de SQL concaténé (`sql` tagué uniquement).
- Tests d'intégration sur Postgres de test isolé (conteneur ou branche Neon dédiée), réinitialisé par suite.
