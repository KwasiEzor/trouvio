# ADR 0014 — Autorisation applicative : identité de session et requêtes scopées
**Statut** : accepté · **Date** : 2026-10 · Plan : `docs/plans/P1-03.md` · Complète l'ADR 0013.

## Contexte
Cinq tables métier portent un `user_id` (`search_profiles`, `offer_scores`, `offer_feedback`, `applications`, `deliveries`), plus `sessions` et `accounts` gérées par Better Auth. Une seule requête oubliant le filtre `user_id` suffit à exposer les données d'un autre utilisateur (IDOR). Next 16 recommande une couche d'accès aux données qui contrôle l'accès au plus près des requêtes, `proxy.ts` ne servant qu'aux contrôles optimistes. `forbidden()` et `unauthorized()` y sont encore expérimentaux.

## Décision
1. **Contrôle d'accès par trois helpers serveur** (`src/lib/auth/guards.ts`), appelés en première ligne de chaque page, Server Action et Route Handler, hors de tout `try/catch` :
   - `requireUser()` : non connecté → redirection vers `/connexion` ;
   - `requireAdmin()` : non connecté → connexion ; connecté sans le rôle → `notFound()` (404) et `warn` avec le seul `userId` ;
   - `authorizeRoute(need)` : réponse JSON 401 `UNAUTHENTICATED` ou 403 `FORBIDDEN`, `Cache-Control: no-store`.
   Une panne de lecture de session remonte, elle n'est jamais changée en « non connecté ».
2. **Décision pure** (`src/lib/auth/access.ts`) : la session est validée par Zod en échec fermé (id uuid, rôle connu, email vérifié exigé en défense en profondeur) et réduite à un DTO `CurrentUser` (`id`, `role`, `email`, `name`).
3. **`UserId` de marque** : seul `access.ts` le fabrique, depuis la session. Une chaîne venue du client ne compile pas là où un `UserId` est attendu ; le cast `as UserId` est refusé par ESLint hors des tests et du kit `src/test/**`.
4. **Portée par prédicat** : toute requête sur une table possédée passe par `ownedBy(table, userId, …conditions)` (`src/lib/db/owned.ts`), y compris dans les conditions de jointure. Le filtre `user_id` est toujours présent.
5. **Registre gardé** : `USER_OWNED_TABLES` (métier) et `AUTH_OWNED_TABLES` (Better Auth) recensent exactement les tables à `user_id` ; un test de parité échoue sur une table non recensée, et le kit IDOR (`seedTwoTenants`) exige un seeder par table (typecheck).
6. **Confinement de l'accès aux données** : routes, pages, Server Actions, composants et `core/` n'importent ni le schéma, ni la base, ni `pg`, ni `drizzle-orm` (ESLint). Les requêtes vivent dans les dépôts de domaine (P5, P6), testés avec le kit IDOR.
7. **Moindre surface de Better Auth** : les routes de sessions et de comptes sans fonctionnalité (`/list-sessions`, qui rendrait les jetons au navigateur, `/revoke-*`, `/update-session`, `/list-accounts`, `/account-info`, `/get-access-token`, `/refresh-token`) sont désactivées ; à rouvrir avec leurs tests IDOR.

## Conséquences
- \+ Un oubli de portée est visible au typage, au lint ou en test, pas seulement en revue.
- \+ Une seule façon de répondre « non connecté » ou « interdit », testée une fois.
- \+ Rôle retiré ou session supprimée : effet à la requête suivante (pas de cache de session, ADR 0013).
- − La portée reste applicative : une requête SQL écrite à la main dans un dépôt peut encore l'oublier ; la revue et le kit IDOR restent nécessaires.
- − Le job quotidien (P5-01) lit les données de tous les utilisateurs : il lui faudra un constructeur `UserId` réservé, interdit d'import ailleurs.

## Alternatives écartées
- **RLS Postgres** : défense « par construction », mais une transaction et un `set_config` par requête, un rôle `BYPASSRLS` pour le job, et des tests plus lourds. À réévaluer en P10-01.
- **Wrapper CRUD générique** (`scopedDb`) : Drizzle 0.45 ne type pas `select`/`update`/`insert` génériques sur une union de tables sans casts, qui annuleraient la garantie.
- **`forbidden()` de Next** : expérimental (`authInterrupts`).
- **Redirection d'un non-admin vers `/fil`** : laisserait croire à un succès.
