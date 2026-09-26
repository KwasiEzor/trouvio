# Évaluation du scoring

- `scoring-golden.jsonl` : jeu de référence. Une ligne = une offre + la bande attendue (`high` ≥ 75, `medium` 50–74, `low` < 50) jugée par un humain pour le profil de référence (seed de Kwasi).
- À compléter jusqu'à **≥ 30 lignes** en tâche P3-04, puis enrichi pendant l'auto-test (chaque désaccord devient une ligne).
- Toujours garder au moins 3 offres piégées (injection de prompt, HTML, texte très long).
- `pnpm eval:scoring` (script à créer en P3-04) : score chaque ligne avec le prompt courant, calcule accord de bande, inversions, sorties invalides, coût ; écrit le détail dans `evals/results/` (ignoré par git). Option `--ci` : code de sortie ≠ 0 si accord < 80 % ou inversion > 0.
