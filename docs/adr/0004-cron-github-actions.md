# ADR 0004 — Déclenchement du job via GitHub Actions
**Statut** : accepté

## Contexte
Le job quotidien doit tourner sans machine allumée en permanence côté développeur, sans coût additionnel.

## Décision
Un workflow planifié (`.github/workflows/cron.yml`) appelle `POST /api/cron/run` avec un secret Bearer. Le travail s'exécute dans l'application.

## Conséquences
+ Gratuit, historisé, relançable manuellement (`workflow_dispatch`).
− Planification GitHub parfois décalée de quelques minutes : sans impact pour un digest quotidien.
− GitHub désactive les workflows planifiés après 60 jours d'inactivité du dépôt : un commit régulier suffit (activité normale du projet).

## Alternatives écartées
cron du VPS (possible en secours) ; n8n (utile pour du no-code, superflu ici).
