---
name: next-task
description: Identifie la prochaine tâche de la ROADMAP, fait produire son plan par l'agent architect, l'écrit dans docs/plans/<ID>.md et demande la validation. Premier pas de chaque session.
disable-model-invocation: true
argument-hint: "[ID optionnel, ex. P2-03]"
allowed-tools: Bash(git status *) Bash(git branch *) Bash(grep *) Read Grep Glob Write
---

## État actuel
- Branche : !`git branch --show-current 2>/dev/null || echo "(pas de dépôt git)"`
- Modifications non commitées : !`git status --short 2>/dev/null | head -20 || true`
- Tâches non cochées (5 premières) : !`grep -nE '^- \[ \] \*\*P[0-9]+-[0-9a-z]+\*\*' docs/ROADMAP.md | head -5 || true`
- Plans existants : !`ls docs/plans/ 2>/dev/null | grep -v README || true`

## Procédure
1. **Choix** : tâche demandée `$ARGUMENTS`, sinon la première non cochée ci-dessus. Si la phase précédente n'a pas franchi sa porte (`/phase-gate`), le signaler et s'arrêter.
2. **Travail en cours** : si des modifications non commitées existent ou si la branche n'est pas `main`, le signaler et demander quoi faire avant de continuer.
3. **Plan** : si `docs/plans/<ID>.md` existe déjà, le relire et le présenter. Sinon, déléguer au sous-agent `architect` avec l'ID, le texte exact de la tâche et ses critères d'acceptation.
4. **Écriture** : enregistrer le plan dans `docs/plans/<ID>.md` avec en tête `Statut : proposé` et la date du jour.
5. **Validation** : présenter un résumé du plan (fichiers, tests, risques, questions ouvertes) et **attendre la validation explicite**. Aucun code avant. Une fois validé, passer `Statut : validé` et indiquer : `/implement-task <ID>`.
