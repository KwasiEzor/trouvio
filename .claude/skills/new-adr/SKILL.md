---
name: new-adr
description: Crée un nouvel ADR numéroté dans docs/adr/ (contexte, décision, conséquences, alternatives) quand une décision contredit ou complète l'architecture existante.
disable-model-invocation: true
argument-hint: "<titre de la décision>"
---

## ADR existants
!`ls docs/adr/ 2>/dev/null || true`

## Procédure
1. Numéro = dernier + 1, sur 4 chiffres ; fichier `docs/adr/<NNNN>-<slug>.md`.
2. Rechercher les ADR et sections d'`ARCHITECTURE.md` impactés ; s'appuyer sur le skill `engineering:architecture` pour structurer l'analyse.
3. Rédiger en français, au format des ADR existants : `# ADR NNNN — $ARGUMENTS`, `**Statut** : proposé · **Date** : <AAAA-MM>`, puis Contexte, Décision, Conséquences (+ / −), Alternatives écartées.
4. Si l'ADR remplace un ancien : passer l'ancien en `Statut : remplacé par ADR NNNN`.
5. Lister les documents à mettre à jour (ARCHITECTURE, ROADMAP, CLAUDE.md, rules) et demander validation avant de passer l'ADR en `accepté`.
