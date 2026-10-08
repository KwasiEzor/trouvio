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
- Convention : `*.test.ts` s'exécute en environnement node, `*.test.tsx` en jsdom (Testing Library) ; tests colocalisés ; E2E dans `tests/e2e/*.spec.ts`.
- Réseau simulé avec le serveur MSW partagé (`src/test/msw/server.ts`) : chaque test déclare ses réponses avec `server.use(...)` ; une requête non simulée fait échouer le test.
- E2E : comptes créés par seed ou par le parcours d'inscription testé, sur domaine réservé ; jamais de données réelles. Emails d'authentification lus dans la boîte d'envoi (`tests/e2e/outbox.ts`).
- Faux secrets : jamais de littéral au format d'un vrai jeton (Telegram, JWT, clés de fournisseurs, DSN réel) ; les fabriquer avec `src/test/secrets-factices.ts`. Emails d'essai sur domaines réservés (`example.com`, `.org`, `.net`, `*.example`, `*.test`, `*.invalid`, `*.localhost`). Vérifié par `src/test/litteraux-secrets.test.ts`.
