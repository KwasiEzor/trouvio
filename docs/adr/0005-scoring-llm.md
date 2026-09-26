# ADR 0005 — Scoring par Claude Haiku 4.5, prompt versionné et évalué
**Statut** : accepté

## Contexte
Le scoring est une tâche de classification/extraction structurée, répétée sur des dizaines d'offres par jour et par utilisateur, sous contrainte de coût (≤ 30 % du prix de la formule de l'utilisateur, voir PRD §6 ; initialement 5 €/mois, revu en P0-00b).

## Décision
Modèle par défaut `claude-haiku-4-5-20251001` (variable `ANTHROPIC_MODEL_SCORING`). Prompts versionnés dans `prompts/`, sortie JSON validée par Zod, évaluation automatique sur un jeu de référence avant tout changement.

## Conséquences
+ Coût maîtrisé, modèle interchangeable par configuration (Sonnet pour une formule Confort, modèle européen en option).
+ Qualité mesurée, pas « au ressenti ».
− Le jeu de référence doit être entretenu (alimenté par l'auto-test puis par les retours « pas pertinent »).
