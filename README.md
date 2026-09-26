# Trouvio — Kit de démarrage pour Claude Code

Ce dépôt ne contient pas encore de code applicatif : il contient **tout ce qu'il faut pour que Claude Code le construise proprement**, phase par phase, avec tests, revues et contrôles de sécurité à chaque étape.

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
| `.github/` | CI (lint, types, tests, build, E2E), sécurité (gitleaks, CodeQL, audit), éval du prompt, cron quotidien, Dependabot, modèle de PR. |
| `prompts/` · `evals/` | Prompt de scoring v1 (résistant à l'injection) + amorce du jeu de référence. |

## 1. Prérequis (une fois)
- **Claude Code** : onglet *Code* de l'application desktop Claude, ou CLI. (Cowork n'est pas adapté au développement avec tests et commits ; garde-le pour les documents et le marketing du lancement.)
- Node.js LTS (22+), **pnpm**, git, **GitHub CLI** (`gh`), **jq** (requis par les hooks — sans lui, les hooks bloquent tout par précaution).
- Comptes : GitHub, Neon, console Anthropic (clé API), France Travail (francetravail.io), Adzuna (developer.adzuna.com), bot Telegram (@BotFather), Resend, Sentry. Stripe plus tard (P9).

## 2. Mise en place (15 minutes)
```bash
# 1. Créer le dépôt privé et y déposer ce kit
gh repo create trouvio --private --clone && cd trouvio
# (copier le contenu du kit ici, y compris les dossiers cachés .claude et .github)
chmod +x .claude/hooks/*.sh .githooks/*
git config core.hooksPath .githooks   # active le hook pre-push (refus de tout push direct sur main)
git add -A && git commit -m "chore: kit de démarrage Trouvio" && git push -u origin main

# 2. Secrets locaux
cp .env.example .env.local   # remplir les valeurs (jamais commité)
```
3. **Secrets GitHub** (Settings → Secrets and variables → Actions) : `ANTHROPIC_API_KEY`, `APP_URL`, `CRON_SECRET` (+ plus tard les secrets de déploiement).
4. **Protection de `main`** : GitHub ne la propose pas sur un dépôt privé en compte gratuit. Elle est assurée localement par `.githooks/pre-push` (refuse tout push qui modifie ou supprime `main`), à activer dans chaque clone avec `git config core.hooksPath .githooks`, et côté Claude par `.claude/hooks/guard-bash.sh`. Dérogation exceptionnelle, par toi seulement : `TROUVIO_ALLOW_PUSH_MAIN=1 git push …`. Tests : `bash scripts/test-githooks.sh`. Avec GitHub Pro ou un dépôt public : activer en plus la vraie protection (Settings → Branches : PR obligatoire, checks `CI / quality`, `CI / e2e`, `Security` requis).
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
