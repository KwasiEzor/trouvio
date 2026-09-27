---
name: test-stack-facts
description: Faits verifies (2026-09-27, plan P0-03) sur la pile de tests Trouvio - jsdom/Node, MSW postinstall, Vitest 5 projects/couverture, Vite 8 JSX, Playwright, permissions pnpm test*
metadata:
  type: project
---

- jsdom 30.x exige Node ^22.22.2 ; avec `engineStrict: true` pnpm refuse l'installation sous Node 22.22.0 (poste local au 2026-09-27). jsdom 29.1.1 accepte ^22.13. Node 22.23.3 dispo (22.22.2/22.23.0/22.23.2 = releases securite).
- msw 2.x a un postinstall (copie le worker navigateur seulement si package.json a `msw.workerDirectory`) -> `allowBuilds: msw: false` suffit pour msw/node. `onUnhandledRequest: "error"` : console.error "[MSW] Error: ..." puis fetch rejete (InternalError via controller.errorWith) ; `request:unhandled` est emis quelle que soit la strategie -> ne pas s'en servir seul comme preuve.
- Vitest 5 : projets inline `extends: true` par defaut ; `coverage` et `reporters` interdits dans un projet (racine uniquement) ; les seuils par glob n'excluent pas les fichiers des seuils globaux ; `coverage.include` par defaut = seulement les fichiers charges par les tests. @vitest/coverage-v8 a vitest en peer EXACT.
- Vite 8.3 : l'oxc lit `jsx: react-jsx` du tsconfig (getRollupJsxPresets -> runtime automatic) -> @vitejs/plugin-react a priori inutile pour les tests (a confirmer a l'implementation P0-03).
- @testing-library/jest-dom 7 : Node >= 22, @testing-library/dom peer requis, entree `@testing-library/jest-dom/vitest`.
- Permissions : `Bash(pnpm test*)` est en allow -> tout script nomme `test...` s'execute sans confirmation. Ne jamais nommer `test:*` un script qui telecharge (ex. navigateurs Playwright) : le telechargement doit rester soumis a confirmation.

**Why:** verifie en planifiant P0-03 (registre npm, sources msw/vite, docs vitest.dev/playwright.dev/nextjs.org).
**How to apply:** reutiliser pour P0-04 (CI : Node, cache navigateurs, groupe Dependabot vitest+coverage), P2 (handlers MSW des adapters), P3 (MSW pour Anthropic). Voir [[env-and-runtime-facts]], [[tooling-gotchas]].
