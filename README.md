# Trouvio — Kit de démarrage pour Claude Code

Ce dépôt contient l'application Trouvio (Next.js, en construction — avancement dans `docs/ROADMAP.md`) et **tout ce qu'il faut pour que Claude Code la construise proprement**, phase par phase, avec tests, revues et contrôles de sécurité à chaque étape.

## Contenu
| Élément | Rôle |
|---|---|
| `CLAUDE.md` | Mémoire du projet, courte : stack, boucle de travail, interdits, Definition of Done, consignes de compaction. Lu à chaque session. |
| `.claude/rules/` | Règles de domaine (db, llm, sources, ui, api-security, tests) chargées **uniquement** quand Claude lit les fichiers concernés (`paths:`). |
| `docs/plans/` | Plan validé de chaque tâche : mémoire de travail qui survit à `/clear` et à la compaction. |
| `docs/PRD.md` · `ARCHITECTURE.md` · `adr/` | Le « quoi » et le « comment », décisions justifiées. |
| `docs/ROADMAP.md` | **Plan de A à Z** : 11 phases, tâches identifiées, critères d'acceptation, portes de sortie. |
| `docs/SECURITY.md` · `TESTING.md` | Modèle de menaces, checklist de revue, stratégie de tests et d'évaluation IA. |
| `docs/design/` · `public/brand/` | Tokens, logos et 12 maquettes HTML de référence. |
| `.claude/agents/` | 6 sous-agents : architect, code-reviewer, security-reviewer (Opus, lecture seule) ; test-engineer, ui-implementer, ai-eval-engineer (Sonnet). |
| `.claude/skills/` | 7 commandes : `/next-task`, `/implement-task`, `/ship-check`, `/phase-gate`, `/security-audit`, `/eval-scoring`, `/new-adr`. |
| `.claude/settings.json` + `hooks/` | Permissions + garde-fous **déterministes** : blocage des commandes dangereuses, protection des `.env`, migrations et prompts publiés, refus de `any`/`console.log`/couleurs en dur, formatage auto, typecheck + tests liés en fin de tour, état de travail injecté au démarrage. Testés par `bash scripts/test-hooks.sh`. |
| `.github/` | Workflows `CI` (quality = `pnpm verify`, e2e), `Security` (gitleaks, audit, dependency-review), `CodeQL` ; Dependabot. À venir : évaluation du prompt (P3), job quotidien (P5). |
| `prompts/` · `evals/` | Prompt de scoring v1 (résistant à l'injection) + amorce du jeu de référence. |

## 1. Prérequis (une fois)
- **Claude Code** : onglet *Code* de l'application desktop Claude, ou CLI. (Cowork n'est pas adapté au développement avec tests et commits ; garde-le pour les documents et le marketing du lancement.)
- Node.js LTS (22+), **pnpm**, git, **GitHub CLI** (`gh`), **jq** (requis par les hooks — sans lui, les hooks bloquent tout par précaution).
- Comptes : GitHub, Neon, console Anthropic (clé API), France Travail (francetravail.io), Adzuna (developer.adzuna.com), bot Telegram (@BotFather), Resend, Sentry. Stripe plus tard (P9).

## 2. Mise en place (15 minutes)
```bash
# 1. Cloner le dépôt (public) et installer
gh repo clone KwasiEzor/trouvio && cd trouvio
nvm use                # Node 22 (.nvmrc)
pnpm install           # dépendances + active le hook pre-push via le script « prepare »
git rev-parse --git-path hooks   # doit afficher .githooks ; sinon : git config core.hooksPath .githooks

# 2. Secrets locaux
cp .env.example .env.local   # remplir au fil des phases (jamais commité)
```
   `pnpm dev` et `pnpm build` fonctionnent sans aucun secret. `pnpm start` exige `APP_URL`. Chaque variable indique dans `.env.example` la phase où elle devient requise ; au démarrage, les noms manquants sont listés (jamais les valeurs). Détail : `docs/ARCHITECTURE.md` §8.
3. **Secrets GitHub** : à partir de P5-02, dans un environnement GitHub `production` réservé au workflow du job (ADR 0008) ; noms identiques à `.env.example`.
4. **Protection de `main`** (dépôt public, ADR 0009) : protection GitHub native — PR obligatoire, checks requis `quality`, `e2e`, `gitleaks`, `audit`, `dependency-review`, `CodeQL` + règle `code_scanning` (alerte haute ou plus refusée), branche à jour, force-push et suppression interdits. En complément, en local : `.githooks/pre-push` (refuse tout push qui modifie ou supprime `main`), activé par `pnpm install` (script `prepare`, repli manuel : `git config core.hooksPath .githooks`), et côté Claude `.claude/hooks/guard-bash.sh`. Tests : `bash scripts/test-githooks.sh`. Aucun secret GitHub n'est nécessaire à la CI. Pièges : ne jamais mettre `[skip ci]` dans le dernier commit d'une PR (les checks requis resteraient en attente) ; pour une PR Dependabot en retard sur `main`, commenter `@dependabot rebase` plutôt que « Update branch ».
5. Ouvre le dossier dans Claude Code et **accepte la confiance de l'espace de travail** (nécessaire pour que les hooks du projet s'exécutent).
6. Colle le contenu de `PROMPT-DE-DEMARRAGE.md` comme premier message.

## 3. La boucle de travail (chaque session)
```
/next-task            → Claude identifie la tâche suivante et fait planifier l'architecte
   (tu valides le plan)
/implement-task P2-03 → branche, tests d'abord, code, portes, revues, ROADMAP cochée, commit
/ship-check           → vérification complète + texte de PR
   (tu relis le diff, pousses, ouvres la PR, la CI tourne, tu merges)
/clear                → contexte propre avant la tâche suivante
```
Fin de phase : `/phase-gate P3`. Avant la bêta et le lancement : `/security-audit`.

## 4. Règles d'or du vibe coding professionnel
1. **Contexte avant code** : Claude lit CLAUDE.md et la tâche ; toi, tu valides un plan avant la moindre ligne.
2. **Une session = une tâche** de la ROADMAP. Petit, vérifiable, réversible.
3. **Les tests définissent le « terminé »**, pas l'impression que « ça marche ».
4. **Relis chaque diff** avant de pousser. Si tu ne comprends pas un changement, demande l'explication ; ne le fusionne pas.
5. **Les règles critiques sont dans des hooks, pas seulement dans du texte** : un hook bloque à 100 %, une consigne écrite est suivie « la plupart du temps ».
6. **Commits fréquents** = points de restauration. En cas de dérive : `git switch main` et recommence la tâche avec un meilleur plan.
7. **Mesure l'IA** : aucune modification de prompt sans `/eval-scoring`.

## 5. Jalons
- **M1** (fin P5) : digest Telegram quotidien pour toi seul → 2 semaines d'auto-test, enrichissement du jeu d'évaluation.
- **M2** (fin P8) : bêta fermée 20–50 testeurs.
- **M3** (fin P10) : lancement public avec facturation.
