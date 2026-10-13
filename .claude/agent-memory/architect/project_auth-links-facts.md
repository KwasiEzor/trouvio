---
name: auth-links-facts
description: Faits verifies (2026-10-13, plan P1-06) sur les liens Better Auth 1.7.7 - verify-email JWT GET sans revocation, magic-link GET, primitives exportees pour des endpoints POST maison, formCsrf, seed
metadata:
  type: project
---

- `/verify-email` (GET) : jeton = JWT HS256 sans etat (reutilisable jusqu'a expiration), marque verifie + autoSignIn, ne retire JAMAIS un mot de passe pose par un tiers (`api/routes/email-verification.mjs` l. 287-316). Seul le lien magique (et email-otp) appelle `revokeUnprovenAccountAccess`.
- `/magic-link/verify` (GET) : find puis `consumeVerificationValue` atomique (expiration incluse) ; identifiant `magic-link:` + SHA-256 base64url sans padding (`storeToken: "hashed"`). `findVerificationValue` ne verifie pas l'expiration et purge les lignes expirees (ecriture).
- Callbacks `sendVerificationEmail` / `sendMagicLink` recoivent `token` : on peut construire sa propre URL (page de l'app) au lieu de `url`.
- Primitives publiques pour un endpoint POST maison : `createAuthEndpoint`, `formCsrfMiddleware`, `getSessionFromCtx` (`better-auth/api`), `revokeUnprovenAccountAccess` (`better-auth/db`), `setSessionCookie` (`better-auth/cookies`), `verifyJWT` (`better-auth/crypto`), `ctx.context.password.verify`, `internalAdapter.findCredentialAccount`. Modeles internes : plugins username (mot de passe) et email-otp (preuve d'email).
- `originCheckMiddleware` (global) ne valide l'origine d'un POST que s'il porte un cookie ; une premiere connexion sans cookie exige `formCsrfMiddleware` (fetch metadata, origine forcee). Routeur : JSON seulement (`allowedMediaTypes`), `disabledPaths` avant le limiteur ; `customRules` (chemin exact) l'emportent sur les regles des plugins. better-call ne route pas un endpoint `metadata.SERVER_ONLY`.
- Seed (`applySeed`) : upsert sur email, ne cree aucun compte `accounts` ; sans garde, il promeut admin une ligne inscrite par un tiers.

**Why:** lu dans node_modules/better-auth/dist pendant le plan P1-06.
**How to apply:** tout plan qui touche un lien envoye par email (P4-03 desinscription, P7-02 reinitialisation), le seed ou les parcours d'activation. Voir [[authz-facts]], [[proxy-csp-facts]].
