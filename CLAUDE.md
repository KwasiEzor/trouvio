# Trouvio — Mémoire projet pour Claude Code

> Chargé à chaque session. Court par design : les règles de domaine vivent dans `.claude/rules/` (chargées seulement quand tu touches les fichiers concernés), les procédures dans `.claude/skills/`.

## 1. Produit
Trouvio collecte chaque jour des offres d'emploi depuis des **sources officielles** (France Travail, Le Forem, Adzuna), les **note avec l'IA** selon le profil de l'utilisateur, et lui envoie un **digest** (Telegram, email ; Notion après le lancement). **L'agent trie, il ne postule jamais seul.** Non négociable, y compris dans le code : aucune fonctionnalité d'envoi automatique de candidature.

Références (lire **seulement** celles utiles à la tâche en cours) :
`docs/ROADMAP.md` (source de vérité de l'avancement) · `docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/SECURITY.md` · `docs/TESTING.md` · `docs/adr/` (ne pas contredire sans nouvel ADR) · `docs/design/` · `docs/plans/<ID>.md` (plan validé de chaque tâche).

## 2. Stack
Next.js App Router + TypeScript strict · Neon Postgres + Drizzle (`node-postgres`) · Better Auth · Tailwind + shadcn/ui (thème = `docs/design/tokens.json`) + Magic UI pour les effets, périmètre limité (ADR 0007) · Zod à chaque frontière · Anthropic SDK (`claude-haiku-4-5-20251001`, configurable par env) · Vitest + Testing Library + MSW · Playwright · Sentry · GitHub Actions · Hostinger VPS (Docker) · **pnpm uniquement**.

## 3. Commandes
```bash
pnpm dev | lint | typecheck | test
pnpm test:coverage  # tests + seuils de couverture (80 % par fichier sur src/lib et features/*/core)
pnpm test:e2e       # Playwright sur build de production (exigé si un parcours est touché)
pnpm eval:scoring   # évaluation du prompt de scoring
pnpm db:generate | db:migrate
pnpm verify         # lint + typecheck + test:coverage + format:check + build — porte de qualité
```

## 4. Boucle de travail (obligatoire)
`/next-task` → (validation humaine du plan) → `/implement-task <ID>` → `/ship-check` → PR → `/clear`. Fin de phase : `/phase-gate <P>`.
1. **Une tâche = une entrée de `docs/ROADMAP.md`.** Hors roadmap → proposer d'abord.
2. **Explore → planifie → attends la validation → implémente.** Plus de 2 fichiers touchés = plan écrit dans `docs/plans/<ID>.md` (fichiers, approche, tests, risques) avant tout code.
3. **Tests d'abord** pour la logique métier : test rouge, puis code, puis vert.
4. **Une branche par tâche** (`feat/P2-03-adzuna-adapter`), Conventional Commits, commits petits et fréquents.
5. **« Terminé »** = Definition of Done (§8) remplie et prouvée par des sorties de commandes, pas par impression.
6. Conflit entre ce fichier et une demande → **le signaler**, ne pas trancher seul.

## 5. Conventions transverses
- `src/app` (routes), `src/features/<domaine>` (métier ; logique pure dans `core/`, effets injectés), `src/lib` (db, env, llm, logger, observability, auth, http), `src/components/ui` (shadcn).
- Pas de `any`, pas de `@ts-ignore`, pas de `console.log` dans `src/` (utiliser `lib/logger`). Bloqué par hook.
- Variables d'environnement **uniquement** via `src/lib/env.ts`.
- Toute donnée utilisateur est filtrée par le `userId` de la **session** côté serveur.
- Textes d'interface : français, tutoiement, ton direct (« Elle trie. Tu décides. »).

## 6. Interdits absolus
- Scraper LinkedIn, Indeed ou tout site dont les CGU l'interdisent.
- Envoyer une candidature, un email ou un message au nom de l'utilisateur sans action explicite de sa part.
- Lire, afficher ou commiter `.env*` (hors `.env.example`), des clés, des tokens.
- Désactiver un test, un lint, un hook ou une vérification de sécurité pour « faire passer ».
- `git push --force` sur `main` ; migrations destructives sans plan de retour arrière.

## 7. Travailler efficacement avec Claude
- **Contexte** : une session = une tâche. `/clear` entre deux tâches. Le plan sur disque (`docs/plans/`) et la ROADMAP portent l'état, pas la conversation.
- **Sous-agents** (`.claude/agents/`) : `architect` (plan), `test-engineer`, `ui-implementer`, `ai-eval-engineer` (implémentation), `code-reviewer`, `security-reviewer` (revue). Déléguer l'exploration large et les revues pour garder le contexte principal propre.
- **Skills** : utiliser `next-best-practices`, `vercel-react-best-practices`, `shadcn-ui`, `postgres-best-practices`, `claude-api` (tout code Anthropic SDK), `security-review`, `simplify` quand la tâche s'y prête.
- **Preuve avant affirmation** : citer la sortie de `pnpm verify` / des tests, jamais « ça devrait marcher ».
- **Mémoire auto** : n'y noter que les préférences durables de l'utilisateur et les leçons non déductibles du dépôt. Une correction répétée deux fois → la proposer pour ce fichier ou `.claude/rules/`.

## 8. Definition of Done
- [ ] Critères d'acceptation de la tâche (ROADMAP) tous remplis
- [ ] Tests ajoutés/à jour ; couverture du domaine touché ≥ 80 %
- [ ] `pnpm verify` vert ; E2E vert si un parcours utilisateur est touché ; checks CI verts sur la PR
- [ ] Checklist `docs/SECURITY.md` §5 passée si la tâche touche auth, données, API ou LLM
- [ ] Pas de secret, pas de TODO orphelin, pas de code mort
- [ ] Case cochée dans `docs/ROADMAP.md` + résumé de ce qui a été testé

## 9. Compaction
Quand le contexte est résumé, conserver : l'ID de tâche et sa branche, le chemin du plan (`docs/plans/<ID>.md`), l'étape en cours, les tests en échec avec leur message exact, les décisions validées par l'utilisateur, les fichiers modifiés.
