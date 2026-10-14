---
name: p1-06-links-review-facts
description: Faits vérifiés en revue P1-06 (2026-10-13) - drizzleAdapter sans transaction (inscription non atomique), purge globale de findVerificationValue, formCsrfMiddleware, recopie du lien magique
metadata:
  type: project
---

Vérifié le 2026-10-13 (better-auth 1.7.7, @better-auth/drizzle-adapter 1.7.7) :
- drizzleAdapter : `config.transaction ?? false` ; le projet ne le passe pas → `runWithTransaction` de /sign-up/email n'ouvre AUCUNE transaction : insertion users puis accounts en deux autocommits. Fenêtre de course avec le seed (ligne vue sans credential, credential ajouté après la promotion admin). Fail-closed grâce à l'activation par mot de passe.
- `internalAdapter.findVerificationValue` : SELECT par identifiant PUIS `DELETE` de toutes les lignes expirées (aucun index sur verifications.expires_at). Appelé par l'aperçu de la page publique /connexion/lien à chaque GET bien formé : la page anonyme touche la base, sans limiteur. `adapter.findOne` ne purge pas.
- formCsrfMiddleware : cookie présent → contrôle d'origine ; sinon Fetch Metadata présente → refuse cross-site+navigate puis contrôle d'origine forcé ; sinon Origin/Referer → forcé ; aucun en-tête → accepté (client non navigateur).
- Upstream magic-link : schéma d'enregistrement `.strict()`, jeton 32 lettres a-zA-Z ; le projet (links.ts) n'est pas strict. verifyJWT (jose) vérifie exp et rend null en cas d'erreur.
- Activation concurrente avec le bon mot de passe : deux sessions (pas de verrou) ; non exploitable (même titulaire).

**Why:** comportements de bibliothèque invisibles dans le diff.
**How to apply:** en revue P7-02 (reset sur le même modèle page + POST), P4-03 (désinscription), P10-02 (seed avant ouverture, limiteur des pages), et à toute montée de better-auth. Voir [[p1-04-ratelimit-review-facts]], [[p1-05-headers-review-facts]].
