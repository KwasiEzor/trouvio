---
name: github-ci-facts
description: Faits verifies (P0-04, 2026-09-27) sur la CI GitHub de Trouvio - depot PUBLIC, ruleset de main, CodeQL bloquant via code_scanning, gitleaks limite a HEAD, Dependabot pnpm, Playwright en CI
metadata:
  type: project
---

- Depot `KwasiEzor/trouvio` rendu PUBLIC (decision utilisateur, ADR 0009) : sur prive gratuit, branch protection et rulesets donnaient 403 ; CodeQL, secret scanning, dependency-review payants.
- Ruleset « main protegee » (id 24085231) : deletion, non_fast_forward, pull_request (squash, 0 approbation, resolution des fils), required_status_checks strict = quality, e2e, gitleaks, audit, dependency-review, CodeQL (integration_id 15368 = GitHub Actions), code_scanning CodeQL (security high_or_higher, alerts errors). Aucun bypass. ATTENTION : deux checks s'appellent « CodeQL » (job Actions 15368 vs resultat github-advanced-security 57789) ; le job seul ne bloque PAS sur les alertes -> d'ou la regle code_scanning.
- Secret scanning + push protection actifs, motifs FOURNISSEURS seulement (non_provider_patterns et validity_checks non activables) : une cle generique passe le push, seul gitleaks la voit (prouve par la PR demo #8).
- gitleaks : binaire v8.30.1 MIT + SHA-256 ; `--log-opts="--full-history HEAD"` obligatoire, sinon `git log --all` sur un checkout fetch-depth 0 scanne TOUTES les branches et une fuite sur une branche tierce bloque toutes les PR.
- Reglages Actions : sha_pinning_required true, allowed_actions selected (GitHub + pnpm/action-setup@*). Toute nouvelle action tierce doit y etre ajoutee.
- Minutes Actions illimitees sur runners standard (public). Planifications desactivees apres 60 j d'inactivite (public).
- Playwright en CI : pas de cache des navigateurs (deconseille) ; `install --with-deps --only-shell chromium`.
- Dependabot : pnpm v7-v10 (ecosysteme npm) ; cooldown 7 j (14 majeures), zizmor exige >= 7 ; groupes = premier correspondant ; majeures ignorees : eslint, typescript, jsdom, @types/node, vite. A verifier au premier passage : acceptation du fichier, compatibilite avec sha_pinning_required.
- Pieges de fusion : `[skip ci]` en tete de PR -> checks requis en attente ; PR Dependabot en retard -> `@dependabot rebase` (pas « Update branch »).
- pnpm `--frozen-lockfile` par defaut en CI ; minimumReleaseAge agit a la resolution seulement.
- `.github/workflows/*` protege par guard-files (confirmation humaine) ; zizmor 1.30.1 (`uvx`, GH_TOKEN pour le mode en ligne) a relancer a chaque modification.

**Why:** constate en implementant P0-04 (gh api, PR #7 verte, PR demo #8 rouge pour les bonnes raisons, revue de code).
**How to apply:** tout plan touchant CI, workflows (P3 eval, P5 job quotidien, P10 deploiement), Dependabot ou le ruleset part de ces faits. Voir [[tooling-gotchas]], [[test-stack-facts]].
