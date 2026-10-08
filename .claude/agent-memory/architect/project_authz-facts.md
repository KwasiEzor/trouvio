---
name: authz-facts
description: Faits verifies (2026-10-08, plan P1-03) sur l'autorisation Trouvio - Drizzle generique, Better Auth 1.7.7 endpoints session/compte, Next 16 forbidden/notFound
metadata:
  type: project
---

- Drizzle 0.45.3 : une fonction generique `<T extends union de tables>` qui appelle `db.select().from(table)`, `db.update(table).set(values)` ou `db.insert(table).values({...v, userId})` ne passe PAS le typecheck sans cast (TableLikeHasEmptySelection, mapped types). Un predicat `ownedBy(table, userId, ...extra): SQL` generique, lui, compile ; et une table sans `userId` y est refusee. Spike fait dans le scratchpad (tsc avec paths vers node_modules du depot).
- Better Auth 1.7.7 : pour un appelant HTTP, la session gagne toujours sur un `userId` du corps (`resolveUserId`, routes /get-access-token, /refresh-token, /account-info) ; un `userId` explicite n'est honore que pour un appel serveur `auth.api.*` sans session -> ne jamais appeler `auth.api.*` avec un id venu du client. `/revoke-session` ignore en silence le jeton d'un autre utilisateur (repond quand meme `{status:true}`). `token` de session n'est pas `returned:false` : `/list-sessions` renvoie les jetons de toutes les sessions actives.
- Next 16.4 (doc 2026-10) : `forbidden()`/`unauthorized()` restent experimentaux (`experimental.authInterrupts`) ; `notFound()` et `redirect()` marchent dans Server Components, Server Functions et Route Handlers (a appeler hors try/catch, sinon `unstable_rethrow`). React `cache` ne deduplique pas dans Server Actions ni Route Handlers.

**Why:** verifie en lisant la source installee et la doc officielle pendant le plan P1-03.
**How to apply:** tout plan qui touche controle d'acces, requetes scopees (P5, P6, P7-04, P8-01) ou endpoints Better Auth part de ces faits. Voir [[env-and-runtime-facts]].
