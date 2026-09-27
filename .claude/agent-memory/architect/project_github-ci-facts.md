---
name: github-ci-facts
description: Faits verifies (2026-09-27, plan P0-04) sur GitHub gratuit + depot prive Trouvio - protection de branche, CodeQL, secret scanning, minutes Actions, gitleaks, Dependabot pnpm, Playwright en CI
metadata:
  type: project
---

- Depot `KwasiEzor/trouvio` PRIVE sur compte GitHub Free : branch protection ET rulesets -> 403 "Upgrade to GitHub Pro or make this repository public" (verifie par gh api). CodeQL/code scanning, secret scanning/push protection et dependency-review-action exigent GitHub Code Security / Secret Protection sur prive -> indisponibles. Protection de main = hook pre-push local + controle a posteriori en CI (plan P0-04).
- Reglages Actions du depot : default_workflow_permissions=read ; API expose `sha_pinning_required` et `allowed_actions` (reglables sans plan payant a priori).
- Minutes : 2 000/mois (Free, prive), arrondi a la minute superieure PAR JOB ; sans moyen de paiement, usage BLOQUE a epuisement (partage avec le futur job quotidien P5 !). Runs Dependabot eux-memes gratuits, mais la CI declenchee par ses PR consomme.
- Planifications desactivees apres 60 j d'inactivite : PUBLIC uniquement (ADR 0004/0008 le disent sans nuance).
- gitleaks-action : EULA proprietaire (licence gratuite exigee pour organisations, pas pour comptes perso), besoin de GITHUB_TOKEN -> preferer le binaire gitleaks (MIT) epingle + SHA-256. Commande actuelle `gitleaks git` (les skills ship-check/security-audit citent encore `gitleaks detect`).
- Playwright doc CI : cache des navigateurs deconseille (restauration ~ telechargement) ; `install --with-deps --only-shell chromium`.
- Dependabot : pnpm v7-v10 supporte (ecosysteme npm), image Node 24 ; cooldown par defaut 3 j pour les version updates (pas les security updates) ; groupes = premier groupe correspondant ; `exclude-patterns` existe.
- pnpm `--frozen-lockfile` par defaut en CI ; minimumReleaseAge agit a la resolution, pas sur un lockfile fige.
- `.github/workflows/*` protege par guard-files (confirmation humaine a chaque ecriture) ; Prettier verifie aussi les YAML (format:check).

**Why:** verifie dans la doc officielle GitHub/pnpm/Playwright et via gh api en planifiant P0-04.
**How to apply:** tout plan touchant CI, workflows (P3 eval, P5 job quotidien, P10 deploiement) ou Dependabot part de ces faits ; re-verifier si le depot devient public ou passe en Pro. Voir [[tooling-gotchas]], [[test-stack-facts]].
