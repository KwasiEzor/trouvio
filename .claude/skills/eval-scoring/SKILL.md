---
name: eval-scoring
description: Évalue le prompt de scoring courant (ou une nouvelle version) sur le jeu de référence et compare à la version précédente — accord de bande, inversions, sorties invalides, coût.
disable-model-invocation: true
argument-hint: "[version, ex. v2]"
---

## Contexte
- Prompts : !`ls prompts/ 2>/dev/null || true`
- Lignes du jeu de référence : !`wc -l < evals/scoring-golden.jsonl 2>/dev/null || true`

## Procédure
1. Déléguer au sous-agent `ai-eval-engineer` (qui invoque le skill `claude-api`).
2. Si le script `pnpm eval:scoring` n'existe pas encore (avant P3-04) : le signaler et s'arrêter.
3. Lancer `pnpm eval:scoring` pour la version `$ARGUMENTS` (ou la plus récente) **et** la version précédente, sur le même jeu.
4. Tableau comparatif : accord de bande (seuil ≥ 80 %), inversions haute/basse (seuil 0), sorties invalides, tokens moyens, coût par offre, coût mensuel estimé pour le profil de référence (seuil ≤ 5 €).
5. Détail des désaccords (id, attendu, obtenu, raison du modèle) ; proposer d'ajouter les cas intéressants au jeu de référence, sans changer les étiquettes existantes.
6. Produire le bloc « Évaluation » à coller dans la PR. Verdict : **adoptable** / **rejetée**.
