# ADR 0006 — Hébergement sur Hostinger VPS avec Docker
**Statut** : proposé (à confirmer selon l'offre Hostinger souscrite)

## Contexte
Préférence pour Hostinger (déjà utilisé). Besoin d'un processus Node persistant, HTTPS, déploiement reproductible.

## Décision
Image Docker de Next.js en sortie `standalone`, publiée sur GitHub Container Registry, déployée sur un **VPS Hostinger** derrière un reverse proxy avec HTTPS automatique (Caddy). Déploiement par GitHub Actions (SSH) après CI verte sur `main`.

## Conséquences
+ Environnement identique local/CI/production, retour arrière = redéployer l'image précédente.
− Administration du VPS à notre charge (mises à jour système, pare-feu) : couverte par le runbook P10.

## Alternative
Si l'offre Hostinger retenue est un hébergement Node.js managé, adapter P10-02 : même build `standalone`, sans Docker.
