# Évaluation du scoring

- `scoring-golden.jsonl` : jeu de référence. Une ligne = une offre + `profile` (nom d'un fichier de `profiles/`) + la bande attendue (`high` ≥ 70, `medium` 50–69, `low` < 50, alignées sur le barème du prompt) jugée par un humain.
- `profiles/reference.json` : critères de recherche du profil de référence, **sans identité** (ni nom, ni email). Valeurs provisoires, à corriger par Kwasi en P3-04.
- À compléter jusqu'à **≥ 30 lignes** en tâche P3-04, puis enrichi pendant l'auto-test (chaque désaccord devient une ligne).
- Toujours garder au moins 3 offres piégées (injection de prompt, HTML, texte très long).
- `pnpm eval:scoring` (script à créer en P3-04) : score chaque ligne avec le prompt courant, calcule accord de bande, inversions, sorties invalides, coût ; écrit le détail dans `evals/results/` (ignoré par git). Option `--ci` : code de sortie ≠ 0 si accord < 80 % ou inversion > 0.
