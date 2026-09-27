---
name: env-and-runtime-facts
description: Faits verifies (2026-09-27) sur la validation d'environnement Trouvio - server-only, instrumentation Next 16, @next/env, Zod 4, Vitest 5 - a reutiliser dans les plans P0-06, P1, P5, P10
metadata:
  type: project
---

- Paquet `server-only` 0.0.1 : `index.js` fait `throw` hors condition d'export "react-server". Donc jamais dans un module importe par le CLI (tsx), Vitest ou instrumentation : src/lib/env.ts ne l'importe pas (garde runtime `typeof window` a la place).
- Next 16.3.6 : `register()` de src/instrumentation.ts n'est PAS appele pendant `next build`. CORRIGE (constate en P0-02) : en `next start`, instrumentation est chargee APRES "Ready" ; une exception y donne "Failed to prepare server" + unhandledRejection, le processus RESTE VIVANT et repond HTTP 500. Ne pas s'en servir pour refuser un demarrage : valider dans next.config.ts (fonction de config, phases PHASE_PRODUCTION_SERVER / PHASE_DEVELOPMENT_SERVER) -> `next start` sort code 1.
- Sortie `standalone` : server.js embarque la config serialisee au build (__NEXT_PRIVATE_STANDALONE_CONFIG) et n'evalue PAS next.config.ts au demarrage -> le point d'entree du conteneur (P10-02) doit appeler assertStartupEnv("web") avant server.js.
- @next/env ne remplace pas une variable deja presente dans process.env, meme vide : `VAR= pnpm start` simule une variable absente sans toucher aux fichiers locaux de secrets.
- Zod 4.6 : les issues n'incluent pas la valeur saisie par defaut (sauf `reportInput`) ; `z.httpUrl()` exige un domaine avec point (refuse localhost) -> utiliser `z.url({ protocol: /^https?$/ })`.
- Vitest 5 (sortie 2026-09-03) : `vite` est une peerDependency NON optionnelle (^6.4 || ^7 || ^8) -> la declarer en devDependency ; Node >= 22.12 ; clearMocks true par defaut.
- Modele de scoring : `claude-haiku-4-5-20251001` est l'ID date actif de Haiku 4.5 (alias `claude-haiku-4-5`).

**Why:** verifies en planifiant P0-02 (lecture du code de next/dist et des docs officielles).
**How to apply:** partir de ces faits pour tout plan touchant env, demarrage, CLI du job, tests ; re-verifier si Next/Zod/Vitest changent de version majeure. Voir [[tooling-gotchas]].
