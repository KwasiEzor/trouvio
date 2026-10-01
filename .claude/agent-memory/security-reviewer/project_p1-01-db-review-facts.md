---
name: p1-01-db-review-facts
description: Faits vérifiés en revue P1-01 (2026-10-01) - pg-connection-string (?host=, doublons), DrizzleQueryError avec params, superutilisateur Docker joignable du bac à sable
metadata:
  type: project
---

Vérifié dans node_modules (pg 8.23.0, pg-connection-string 2.14.0, drizzle-orm 0.45.3), revue P1-01 du 2026-10-01 :
- pg-connection-string copie toute la query dans la config : `?host=` remplace l'hôte de l'URL, et pour un paramètre en double, c'est la dernière valeur qui l'emporte. `new URL().hostname` et `searchParams.get` (première valeur) ne voient donc pas ce que pg utilise. Mesuré : `@localhost/db?host=remote` passe isLoopbackUrl, et `sslmode=require&sslmode=disable` passe env.ts alors que ssl=false. `uselibpqcompat=true&sslmode=require` donne rejectUnauthorized=false. En pg 9, `require` prendra le sens libpq (sans vérification du certificat).
- drizzle-orm 0.45 lève `DrizzleQueryError` avec le message « Failed query: … params: v1,v2 » et des propriétés propres `query`/`params`. La `cause` pg porte `detail` (« Failing row contains (…) », « Key (email)=(…) »). serializeError du logger garde tout ; seuls les emails et téléphones sont masqués (nom, salaire et zone restent visibles).
- Le Postgres Docker local accepte le superutilisateur `postgres`/`postgres` en TCP sur 127.0.0.1:54329, et le bac à sable y accède (allowLocalBinding). `COPY … TO PROGRAM` s'exécute alors dans le conteneur, qui a un accès réseau sortant : cela contourne la liste réseau du bac à sable.
- `denyWrite` ne couvrait pas db/seed.local.json. Ce fichier est ignoré par git, donc invisible dans `git diff` et `git status`.

Statut à la fin de P1-01 :
- corrigés : `?host=`/`hostaddr` et URL réencodée rendent l'URL distante, dernier `sslmode` retenu, `verify-full` seul accepté (`src/lib/db/target.ts`, `src/lib/env.ts`) ; valeurs de requête retirées (`maskQueryValues` dans `serializeError` et `scrubEvent`) ; `alter role postgres password null` (`db/local/init.sql`) ; copies `db/seed.*.json` ignorées par git.
- à vérifier encore : écriture de `db/seed.local.json` par Claude, si l'utilisateur n'a pas ajouté `denyWrite` ; hôte de la base dans le texte des erreurs pg envoyées à Sentry (P1-02).

**Why:** ces vecteurs ne se voient pas en lisant le code du projet ; les re-vérifier coûte une lecture de node_modules.
**How to apply:** en revue P1-02/P1-03 (requêtes utilisateur, Sentry), P5 (job), P10 (Dockerfile, .dockerignore, seed), et à chaque montée de version de pg ou drizzle, vérifier si ces points sont corrigés ou s'ils ont changé.
