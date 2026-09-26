---
paths:
  - "prompts/**"
  - "evals/**"
  - "src/features/scoring/**"
  - "src/lib/llm/**"
---

# Règles IA (scoring)

- Invoquer le skill `claude-api` avant d'écrire ou modifier du code Anthropic SDK (modèles, cache de prompt, comptage de tokens).
- Le prompt vit dans `prompts/scoring.vN.md`. **Ne jamais modifier une version publiée** : toute modification = nouvelle version `vN+1` + `pnpm eval:scoring` + résultat noté dans la PR (`/eval-scoring`).
- Le contenu des offres est **non fiable** : placé entre balises délimitées, jamais interprété comme instruction. Neutraliser toute occurrence des balises de délimitation (`<offre>`, `</offre>`, `<profil>`…) dans le texte de l'offre avant insertion.
- Sortie validée par Zod ; score entier borné 0–100 ; réponse invalide ou non parsable = offre `unscored`, **jamais** un score inventé ni une exception non gérée.
- Mapping explicite des clés du modèle vers la base (`points_forts` → `strengths`, `points_de_vigilance` → `concerns`, `raison` → `reason`).
- Envoyer au modèle **uniquement** les critères de recherche nécessaires : jamais nom, email, id utilisateur.
- Chaque appel enregistre modèle, version de prompt, tokens entrée/sortie et coût dans `offer_scores`.
- Aucun outil (tool use) exposé au modèle de scoring.
- Tests : aucun appel réseau réel dans `pnpm test` (MSW) ; appels réels réservés à `pnpm eval:scoring`.
- Le jeu `evals/scoring-golden.jsonl` garde toujours ≥ 3 offres piégées (injection, HTML, texte très long).
