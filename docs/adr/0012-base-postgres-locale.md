# ADR 0012 — Base Postgres locale non secrète (Docker) et rôles de base
**Statut** : accepté · **Date** : 2026-10 · Plan : `docs/plans/P1-01.md` · Complète l'ADR 0011 (§6) et l'ADR 0002.

## Contexte
Le bac à sable de Claude (ADR 0011) ne laisse entrer aucun secret : `.env.local` est illisible et `*.neon.tech` n'est pas dans la liste réseau. Or, à partir de P1-01, Claude doit lancer des migrations, un seed et des tests d'intégration sur un vrai Postgres. L'ADR 0002 demande des tests « identiques à la production », donc avec `pg`, et `.claude/rules/db.md` impose un Postgres de test isolé (conteneur ou branche Neon).

Mesures faites dans le bac à sable (2026-09-30) :
- TCP vers `127.0.0.1` est permis sur tout port ;
- le socket Unix `/tmp/.s.PGSQL.*` est refusé (EPERM).

Un Postgres Homebrew (`postgresql@16`) écoutait sur `127.0.0.1:5432`, sous le compte de l'utilisateur, hors bac à sable. L'initialisation Homebrew accepte par défaut les connexions locales sans mot de passe (`trust`). Un code confiné aurait donc pu s'y connecter en superutilisateur et lire `.env.local` ou `~` par `COPY … FROM PROGRAM` ou `pg_read_file`, ce qui franchit la frontière. L'utilisateur l'a arrêté le 2026-10-01 (`brew services stop postgresql@16`) ; le port refuse désormais la connexion depuis le bac à sable.

## Décision
1. **Postgres local = conteneur Docker** (`db/local/compose.yaml`), lancé par l'utilisateur dans son terminal (`pnpm db:local:up`), Docker étant hors du bac à sable.
   - Image `postgres:18-alpine` épinglée par digest, identique à celle du service Postgres de la CI (`src/lib/db/local-parity.test.ts`). Version alignée sur le projet Neon, créé en 18.
   - Port publié sur **`127.0.0.1:54329`** seulement : `0.0.0.0` exposerait la base au réseau local, et 54329 évite un Postgres déjà installé sur 5432.
   - Volume nommé ; aucun montage de l'hôte hormis `init.sql` en lecture seule. Ce qui s'exécute côté serveur reste dans le conteneur.
2. **Rôle `trouvio` non superutilisateur** (`db/local/init.sql`) : `NOSUPERUSER NOCREATEROLE CREATEDB`, propriétaire de `trouvio_dev`. C'est la même situation que le propriétaire du schéma sur Neon : une migration qui exigerait un superutilisateur échoue dès le poste. Le superutilisateur du conteneur ne sert qu'à l'initialisation, puis perd son mot de passe (`alter role postgres password null`) : il n'est joignable que par le socket du conteneur (`docker exec`). Sinon, du code confiné s'y connecterait par la boucle locale et lancerait `COPY … TO PROGRAM` dans le conteneur, qui a un accès réseau sortant : la liste de domaines du bac à sable serait contournée.
3. **Variables non secrètes dans `db/local/dev.vars`**, fichier commité dont le nom évite le motif des fichiers de secrets (option B du plan P0-08). Il est lu par `node --env-file` pour `db:migrate:local` et `db:seed:local`. Les identifiants sont jetables : la base reste en boucle locale, sans donnée réelle.
4. **Tests d'intégration** (projet Vitest `db`, fichiers `*.db.test.ts`) :
   - `TEST_DATABASE_URL` vaut par défaut `127.0.0.1:54329`, et **toute URL hors boucle locale est refusée**, donc aucun test ne peut viser Neon ;
   - une base modèle est migrée une fois, puis chaque fichier de test en clone une à son nom, supprimée à la fin ;
   - base injoignable : erreur explicite (« lance `pnpm db:local:up` »), jamais de test sauté.
5. **Deux rôles en production** :
   - `DATABASE_URL` = rôle applicatif `trouvio_app` (DML seulement), pour le web, le job et le seed ;
   - `DATABASE_MIGRATION_URL` = rôle propriétaire (DDL), lu seulement par `db:migrate`.

   Les deux URL exigent `sslmode=verify-full` hors boucle locale (`require` ne vérifie le certificat qu'en pg 8). La boucle locale est lue comme la lit `pg` : un paramètre `host` ou `hostaddr`, ou une URL que `pg` réencoderait, rend l'URL distante, et la dernière occurrence de `sslmode` l'emporte. `trouvio_app` est créé **en SQL** (et non dans la console Neon, qui lui donnerait `neon_superuser`), avec `ALTER DEFAULT PRIVILEGES`, **avant** la première migration.
6. **Qui fait quoi** :
   - **Claude (bac à sable)** : `db:generate`, `db:check`, `db:migrate:local`, `db:seed:local --file db/seed.example.json`, tests, `verify`.
   - **Utilisateur (terminal)** : `db:local:up` ; sur Neon, `db:migrate:neon` puis `db:seed:neon --allow-remote`, avec `.env.local`.
   - **CI** : service Postgres et `init.sql` dans `quality`.
7. **Seed personnel** : `db/seed.local.json` (profil réel, prétentions salariales) est ignoré par git, comme toute copie `db/seed.*.json` sauf l'exemple, et **illisible pour Claude** (`denyRead` et `Read(...)` en refus). Claude utilise l'exemple fictif. Les erreurs de requête ne journalisent aucune valeur liée (`maskQueryValues`), et le seed compte à part les comptes modifiés.
8. **Règle** : aucun serveur de base de données lancé hors bac à sable ne doit accepter les connexions locales sans mot de passe. Le bac à sable joint tout port localhost, et le proxy ne voit pas ce trafic.

## Conséquences
- \+ Migrations, seed et tests d'intégration lancés par Claude sans aucun secret, sur la même image qu'en CI.
- \+ Un rôle non superutilisateur partout : parité avec Neon, aucune exécution côté serveur hors du conteneur.
- \+ Les tests ne peuvent pas viser une base distante ; chaque fichier a sa base.
- − `pnpm test` et `pnpm verify` exigent Docker lancé, sur le poste comme en CI (service). Le message d'erreur le dit.
- − Docker Desktop doit tourner sur le poste de l'utilisateur.
- − Résiduel : tout autre service en écoute sur la boucle locale reste joignable depuis le bac à sable (ADR 0011, `allowLocalBinding`). La règle 8 vaut pour toute base ou tout service d'administration local.
- − Les messages d'erreur de `pg` (connexion refusée, hôte introuvable) peuvent citer l'hôte de la base. Le journal masque `address`, mais pas le texte du message. Sans gravité pour les commandes Neon lancées par l'utilisateur dans son terminal ; à reprendre en P1-02, quand le web enverra ces erreurs à Sentry.

## Alternatives écartées
- **Postgres.app ou Homebrew** : le serveur tourne sous le compte de l'utilisateur, hors bac à sable, en `trust` par défaut ; un superutilisateur joignable depuis le bac à sable franchit la frontière.
- **PGlite** (WASM, en processus) : autre pilote que la production (contraire à l'ADR 0002), une seule connexion (pas de test de verrou concurrent pour P5-01).
- **Branche Neon de test** : exigerait un secret et `*.neon.tech` dans le bac à sable (contraire à l'ADR 0011).
- **Un seul rôle pour l'application et les migrations** : le job (P5-02) détiendrait des droits DDL.
