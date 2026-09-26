---
name: implement-task
description: Implémente une tâche de la ROADMAP dont le plan est validé — branche, tests d'abord, code, portes de qualité, revues, ROADMAP cochée, commits.
disable-model-invocation: true
argument-hint: "<ID, ex. P2-03>"
arguments: [id]
---

## Contexte
- Branche : !`git branch --show-current 2>/dev/null || true`
- Plan : !`head -5 docs/plans/$id.md 2>/dev/null || echo "AUCUN PLAN pour $id — lancer /next-task $id d'abord"`
- Tâche : !`grep -n "\*\*$id\*\*" docs/ROADMAP.md || echo "ID $id introuvable dans la ROADMAP"`

## Préconditions (s'arrêter si l'une échoue)
- `docs/plans/$id.md` existe et porte `Statut : validé`.
- Arbre de travail propre.

## Procédure
1. **Branche** : depuis `main` à jour, `git switch -c <type>/$id-<slug>` (`feat`, `fix`, `chore`, `test`, `docs` selon la tâche).
2. **Tâches** : découper le plan en étapes suivies (liste de tâches), une étape active à la fois.
3. **Tests d'abord** (logique métier) : déléguer au sous-agent `test-engineer`, ou les écrire soi-même, puis lancer les tests et **montrer qu'ils échouent pour la bonne raison**. Commit `test(<scope>): …`.
4. **Implémentation** : le minimum pour passer au vert, étape par étape. Travail d'interface → sous-agent `ui-implementer`. Prompt ou éval → `ai-eval-engineer`. Commit à chaque étape verte (`feat(<scope>): …`).
5. **Portes** : `pnpm verify` (et `pnpm test:e2e` si un parcours utilisateur est touché). En cas d'échec, corriger la cause, jamais le test ni la règle.
6. **Revues** en parallèle : sous-agent `code-reviewer` ; sous-agent `security-reviewer` si auth, données, API, webhooks ou LLM sont touchés. Corriger tout point bloquant ou important, relancer `pnpm verify`.
7. **Simplification** : skill `simplify` sur le diff si la revue signale de la complexité.
8. **Clôture** : cocher `$id` dans `docs/ROADMAP.md`, mettre `Statut : terminé` dans le plan, ajouter en fin de plan une section « Réalisé » (écarts au plan, décisions prises). Commit `docs: …`.
9. **Rapport** : tests ajoutés (nombre, types), sortie résumée de `pnpm verify`, couverture du domaine, points de revue traités. Proposer `/ship-check`.

Ne jamais pousser ni ouvrir de PR sans demande explicite.
