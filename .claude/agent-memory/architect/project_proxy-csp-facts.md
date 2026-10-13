---
name: proxy-csp-facts
description: Faits verifies (2026-10-13, plan P1-05) sur proxy.ts de Next 16.3.8, CSP a nonce, nextCookies et /get-session de Better Auth 1.7.7 - a reutiliser pour P6, P7 (Magic UI, Radix), P9, P10
metadata:
  type: project
---

- Next 16.3.8 lit le nonce dans l'en-tete de REQUETE `content-security-policy` (script-src, sinon default-src ; regex `'nonce-[A-Za-z0-9+/_-]+={0,2}'`) : le proxy doit toujours ecraser cet en-tete. Nonce = rendu dynamique obligatoire (une page prerendue n'a pas de nonce) ; PPR incompatible.
- Proxy (Node par defaut, `runtime` interdit) : l'adaptateur fournit un request store -> `headers()`/`cookies()` de next/headers marchent dans le proxy ; les cookies poses par `cookies().set` ECRASENT le Set-Cookie de la reponse (`response.headers.set`). Les en-tetes Flight (`rsc`, `next-router-prefetch`) sont RETIRES de `request.headers` : impossible de reconnaitre un prefetch ou une navigation RSC dans le code du proxy (seul le `matcher` `missing` le peut) -> utiliser `sec-fetch-dest`.
- `next/experimental/testing/server` 16.3.8 exporte `unstable_doesMiddlewareMatch` (la doc dit `unstable_doesProxyMatch`, absent) et `unstable_getResponseFromNextConfig` (teste `headers()` de next.config).
- Better Auth 1.7.7 : `nextCookies` ne saute la prolongation qu'en RSC (en-tete `RSC: 1` sans `next-action`) ; sur un chargement de document, `auth.api.getSession` dans un Server Component PROLONGE la ligne en base mais le cookie n'est pas reecrit (erreur avalee) -> cookie expire 7 j apres la connexion. `disabledPaths` n'agit que dans le routeur HTTP : `auth.api.getSession` reste utilisable. `/sign-in/email` rend aussi `token` en JSON. Le client ne GET `/get-session` qu'au montage de `useSession` (nanostores onMount). Controle d'origine : `Origin: null` + `sec-fetch-site: same-origin` accepte.
- next/image rend `style="color:transparent"` ; Magic UI / motion rendent des attributs style au SSR -> `style-src-attr 'unsafe-inline'` necessaire si `style-src` porte un nonce. Radix Dialog (react-remove-scroll) injecte un `<style>` : il lui faudra le nonce (get-nonce / setNonce).
- Sentry v11 `tunnelRoute` : string fixe ou true (aleatoire par build) ; passe par le proxy, a exclure du matcher.

**Why:** verifie dans node_modules (docs Next embarquees, dist next/better-auth/@sentry/nextjs) pendant le plan P1-05.
**How to apply:** tout plan qui touche proxy.ts, la CSP, un composant qui injecte du style ou un script tiers (P6, P7-01 Magic UI, P9 Stripe), ou la session. Voir [[authz-facts]], [[sentry-logging-facts]], [[ui-theme-facts]].
