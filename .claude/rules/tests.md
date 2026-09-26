---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "tests/**"
  - "vitest.config.*"
  - "playwright.config.*"
---

# Règles de tests

- Stratégie complète : `docs/TESTING.md`.
- Test d'abord pour la logique métier : écrire le test, le voir **échouer pour la bonne raison**, puis coder.
- Aucun appel réseau réel (MSW pour sources et Anthropic). Pas de `sleep` : horloge simulée (`vi.useFakeTimers`).
- Un test = un comportement, nom en français décrivant l'attendu (`it("ignore une offre déjà vue sur une autre source")`).
- Interdit : `.skip`, `.only`, `expect(true)`, assouplir une assertion pour faire passer. Un test instable se corrige, il ne se désactive pas.
- Chaque bug corrigé ajoute un test de non-régression.
- E2E : comptes créés par seed, jamais de données réelles.
