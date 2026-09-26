# ADR 0001 — Monolithe modulaire Next.js
**Statut** : accepté · **Date** : 2026-09

## Contexte
Un seul développeur, budget minimal, besoin d'aller vite sans dette structurelle. Le produit combine site public, application authentifiée, API et un job quotidien.

## Décision
Un seul projet **Next.js (App Router) + TypeScript strict**, organisé par domaines (`src/features/*`). Le job quotidien est une route API protégée du même projet.

## Conséquences
+ Un seul déploiement, un seul pipeline, typage de bout en bout.
+ Stack déjà maîtrisée (réduction du risque).
− Le job partage les ressources du serveur web : à surveiller ; extraction en worker séparé possible plus tard sans réécriture (le cœur métier est indépendant du framework).

## Alternatives écartées
Laravel + Filament (excellent, mais écosystème IA/SDK et UI maquettée en React) ; microservices (complexité injustifiée).
