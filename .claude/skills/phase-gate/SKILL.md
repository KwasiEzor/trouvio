---
name: phase-gate
description: Vérifie qu'une phase de la ROADMAP franchit sa porte de sortie (toutes tâches cochées, critères de la porte, revue sécurité de la phase) avant de démarrer la suivante.
disable-model-invocation: true
argument-hint: "<phase, ex. P3>"
arguments: [phase]
---

## Contexte
!`awk -v p="## $phase " 'index($0,p)==1{f=1} f&&/^## P/&&index($0,p)!=1{f=0} f' docs/ROADMAP.md || true`

## Procédure
1. Toutes les tâches de `$phase` sont cochées ; sinon lister les restantes et s'arrêter.
2. Pour chaque critère de la **porte** de `$phase`, produire une preuve vérifiable (sortie de commande, rapport, mesure). Ce qui exige une action humaine (collecte réelle, 7 jours de digest, réception d'un message) est listé comme « à confirmer par l'utilisateur », jamais présumé.
3. `pnpm verify` + `pnpm test:e2e` sur `main` (E2E lancé par l'utilisateur dans son terminal, ADR 0011).
4. Sous-agent `security-reviewer` sur l'ensemble du code de la phase (pas seulement le dernier diff).
5. Relecture de cohérence : `docs/ARCHITECTURE.md`, ADR et ROADMAP reflètent ce qui a été construit ; proposer les corrections.
6. Rapport : critère → preuve → statut. Verdict : **Porte franchie** / **Porte non franchie** (bloquants). En cas de succès, ajouter sous la porte dans la ROADMAP : `✅ Franchie le <date>`.
