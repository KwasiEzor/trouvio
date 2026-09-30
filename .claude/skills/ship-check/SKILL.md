---
name: ship-check
description: Vérification finale d'une branche avant PR — portes de qualité complètes, Definition of Done, recherche de secrets, texte de PR prêt à coller. Claude ne la lance que sur demande explicite de l'utilisateur ; elle ne pousse jamais et n'ouvre jamais de PR d'elle-même.
---

## Contexte
- Branche : !`git branch --show-current 2>/dev/null || true`
- Commits de la branche : !`git log --oneline main..HEAD 2>/dev/null | head -30 || true`
- Fichiers modifiés : !`git diff --stat main...HEAD 2>/dev/null | tail -40 || true`

## Procédure
1. Refuser sur `main`. Arbre de travail propre (sinon, lister et demander).
2. Lancer et citer le résultat : `pnpm verify` ; `pnpm test:e2e` si `src/app` ou un parcours est touché (demander à l'utilisateur de le lancer dans son terminal et de coller le résumé, ADR 0011) ; `pnpm eval:scoring --ci` si `prompts/` ou `src/features/scoring` est touché.
3. Secrets : chercher dans `git diff main...HEAD` des motifs de clés/tokens (`sk-`, `ghp_`, `AKIA`, `-----BEGIN`, `password=`, `Bearer `) et tout fichier `.env*` autre que `.env.example`. `gitleaks git` si installé (la CI le lance de toute façon).
4. Qualité : aucun `.only`/`.skip`, `console.log`, `any`, `@ts-ignore`, `TODO` sans ticket dans le diff.
5. Definition of Done (`CLAUDE.md` §8) : cocher chaque point avec sa preuve. Checklist `docs/SECURITY.md` §5 si concernée.
6. ROADMAP cochée et plan `docs/plans/<ID>.md` au statut `terminé`.
7. Produire le **texte de PR** : titre Conventional Commit ; sections Contexte (ID + lien plan), Changements, Tests (commandes + résultats), Sécurité, Coût IA (si concerné), Captures (si UI), Retour arrière. Terminer par la ligne d'attribution Claude Code.

Verdict final : **Prêt** ou liste des bloquants. Ne pas pousser sans demande explicite.
