---
name: p0-07-guard-bypasses
description: Contournements de guard-bash.sh relevés à la porte P0 et corrigés en P0-07 ; faux positif Telegram ; résiduel renvoyé au bac à sable (P0-08)
metadata:
  type: project
---

Porte P0 (2026-09-29), corrigé par P0-07 :
- **Alerte de secret scanning n° 1** : c'était le jeton d'exemple de la doc Telegram (`bot<9 chiffres>:<34 caractères>`) dans `redact.test.ts`. gitleaks ne l'a pas vu (sa règle Telegram exige un mot-clé proche), GitHub oui. L'alerte est fermée « used in tests » ; les faux secrets sont désormais fabriqués par `src/test/secrets-factices.ts`, et `src/test/litteraux-secrets.test.ts` refuse tout littéral au format réel.
- **Contournements de `guard-bash.sh` corrigés** :
  - `grep -r`, `rg -u`/`--no-ignore`/`-g`, `git grep --no-index` ;
  - jokers sur fichiers cachés (`.en?.local`, `.[e]nv`, `".e"*`, `*(D)`, globdots), noms reconstruits (`${f}v.local`, `'.'+'env.local'`), `$'\x2e…'` ;
  - `awk system/getline/ENVIRON/tube/-f`, `sed e/w`, `set`/`export`/`declare -p`, `git add -f`, `git stash -a` ;
  - `find -exec`, `xargs` et les copies du dépôt demandent confirmation.

  Le hook lit la commande avec suivi des guillemets et des `$( … )` imbriqués, heredocs retirés. Il couvre 190 cas environ, et ses mutations sont prouvées sur une copie.
- **Outil Grep** : `guard-files` refuse un chemin `.env*`, la cible d'un lien symbolique vers un `.env*`, et un joker `glob` sur `.env*` ou sur des fichiers cachés. L'outil Grep était absent de l'environnement de test : garde posée par précaution.

**Why:** la doc de Claude Code range `grep`, `cat`, `find`… dans un jeu en lecture seule exécuté sans demande. Retirer `Bash(grep *)` de `allow` ne change donc rien : seuls une règle `ask`/`deny` ou un hook agissent. Les règles `deny` de Read ne couvrent pas `grep -r .` ni les sous-processus.

**How to apply:** le hook est un filet, pas une frontière. Tout outil autorisé qui exécute du code du dépôt (`pnpm test`, `dev`, `build`, `node -e`) peut encore lire `.env.local` : c'est le résiduel de P0-08 (bac à sable Seatbelt, `denyRead`). En revue, signaler toute nouvelle commande autorisée capable d'exécuter du code, et vérifier que `scripts/test-hooks.sh` (lancé en CI) reste vert.
