# ADR 0009 — Dépôt public : contrôles de sécurité natifs de GitHub
**Statut** : accepté · **Date** : 2026-09

## Contexte
Sur un dépôt privé en compte GitHub gratuit, la protection de branche et les rulesets sont refusés (HTTP 403, vérifié), CodeQL, le secret scanning, la push protection et la dependency review sont payants, et les minutes Actions sont limitées à 2 000 par mois (usage bloqué au-delà, y compris le futur job quotidien de l'ADR 0008). La ROADMAP exige pourtant une protection de `main` (P0-04).

## Décision
Le dépôt `KwasiEzor/trouvio` est **public**. On active :
- protection de `main` : PR obligatoire, checks requis (`quality`, `e2e`, `gitleaks`, `audit`, `CodeQL`), branche à jour, force-push et suppression interdits ;
- CodeQL, secret scanning, push protection, dependency review, alertes et correctifs Dependabot ;
- réglages Actions : actions épinglées par SHA obligatoires, actions autorisées limitées (GitHub + `pnpm/action-setup`).
Les garde-fous locaux (hook pre-push, hooks de Claude) restent en place.

## Conséquences
+ Protection réelle de `main` et contrôles de sécurité complets, gratuits ; minutes Actions illimitées sur les runners standard.
− **Tout le contenu est public** : code, PRD (tarifs, positionnement), prompt de scoring, jeu d'évaluation, plans, maquettes, configuration de Claude, prénom et recherche d'emploi de l'utilisateur zéro, et l'adresse e-mail personnelle présente dans 2 commits antérieurs (historique non réécrit : force-push interdit). Choix fait en connaissance de cause après audit de l'historique (aucun secret trouvé).
− Discipline renforcée : **aucune donnée réelle** dans le dépôt (seed personnel dans `db/seed.local.json` ignoré, évaluations sans identité, fixtures anonymisées) ; commits avec l'adresse GitHub anonyme.
− Les workflows planifiés sont désactivés après 60 jours d'inactivité du dépôt public (ADR 0004 et 0008) : un commit régulier suffit.

## Alternatives écartées
- **Rester privé et gratuit** : protection seulement locale et contrôle a posteriori, sans CodeQL ni secret scanning ; quota de minutes partagé avec le job quotidien.
- **GitHub Pro** : protection de branche en privé, mais CodeQL et secret scanning restent payants à part.
