# Plans de tâches

Un fichier par tâche de la ROADMAP : `docs/plans/<ID>.md` (ex. `P2-03.md`).

- Créé par `/next-task` à partir du plan de l'agent `architect`.
- Porte un statut en tête : `Statut : proposé` → `validé` (par l'utilisateur) → `terminé`.
- `/implement-task <ID>` refuse de démarrer sans plan `validé`.
- Survit à `/clear` et à la compaction : c'est la mémoire de travail de la tâche. Le hook `SessionStart` le signale automatiquement quand la branche porte l'ID.
- À la clôture, une section « Réalisé » note les écarts au plan et les décisions prises.
