---
name: tooling-gotchas
description: Pieges non evidents des garde-fous Trouvio et de Next.js 16 a anticiper dans chaque plan (hooks Bash, next dev qui reecrit CLAUDE.md, verification du hook git)
metadata:
  type: project
---

- guard-bash.sh refuse toute commande Bash dont le TEXTE contient la cle git "hooksPath" (prefixee core.) ou le chemin du hook pre-push du dossier githooks, meme en lecture (cat). Lire ces fichiers avec l'outil Read ; verifier l'activation du hook git avec `git rev-parse --git-path hooks` (attendu : .githooks). Ecrire package.json (script prepare) avec Write/Edit, jamais via Bash.
- Next.js 16.3 : `next dev` detecte un agent IA et AJOUTE un bloc "nextjs-agent-rules" dans CLAUDE.md (ou AGENTS.md s'il existe). Desactivation : `agentRules: false` dans next.config.ts (verifie dans next@16.3.6 dist/server/lib/start-server.js). Tout plan qui lance `pnpm dev` doit verifier que CLAUDE.md reste inchange (git status).
- `next start` avertit si `output: 'standalone'` : standalone reporte a P10-02 (Dockerfile).
- Compatibilite constatee le 2026-09-27 : typescript-eslint 8.70 exige TypeScript < 6.1 (TS 7.0 est "latest" sur npm) ; plugins bundles par eslint-config-next 16.3.6 (react, import, jsx-a11y) plafonnent a ESLint ^9. Le gabarit create-next-app 16.3.6 fixe typescript ^5 et eslint ^9. Re-verifier avant toute montee de version (Dependabot P0-04).

**Why:** decouvert en planifiant P0-01 ; un appel Bash a ete bloque et next dev aurait modifie CLAUDE.md en silence.
**How to apply:** dans chaque plan touchant le hook git, next dev, ou les versions TS/ESLint, prevoir ces contournements et verifications. Decisions validees de P0-01 : docs/plans/P0-01.md.
- Sondes ESLint par stdin : `--stdin-filename` doit viser un fichier EXISTANT couvert par tsconfig (ex. src/app/page.tsx), sinon "not found by the project service" sur tout code ; verifier l'identifiant de regle dans la sortie (grep no-explicit-any), pas seulement le code de sortie.
