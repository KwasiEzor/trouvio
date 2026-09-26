#!/usr/bin/env bash
# Teste le hook git pre-push contre un dépôt distant jetable (aucun accès réseau).
# Usage : bash scripts/test-githooks.sh     (code de sortie ≠ 0 si un cas échoue)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

git init -q --bare "$TMP/remote.git"
git init -q -b main "$TMP/work"
cd "$TMP/work" || exit 1
git config user.email test@example.invalid
git config user.name test
git config core.hooksPath "$ROOT/.githooks"
git remote add origin "$TMP/remote.git"
git commit -q --allow-empty -m init
# Amorçage du distant (dérogation, comme la création initiale du dépôt).
TROUVIO_ALLOW_PUSH_MAIN=1 git push -q origin main 2>/dev/null

check() { # <attendu ok|refus> <libellé> <commande…>
  local expected="$1" label="$2"; shift 2
  if "$@" >/dev/null 2>&1; then got=ok; else got=refus; fi
  if [[ "$got" == "$expected" ]]; then pass=$((pass+1)); else fail=$((fail+1)); echo "ÉCHEC $label : attendu $expected, obtenu $got"; fi
}

git commit -q --allow-empty -m "sur main"
check refus "push direct sur main"          git push origin main
check refus "push HEAD:main"                git push origin HEAD:main
check refus "push --all inclut main"        git push --all origin
git switch -q -c feat/P0-01-test
check ok    "push d'une branche de tâche"   git push origin feat/P0-01-test
check refus "branche locale vers main"      git push origin feat/P0-01-test:main
check refus "suppression de main"           git push origin :main
check ok    "dérogation explicite"          env TROUVIO_ALLOW_PUSH_MAIN=1 git push origin main

echo "Hook pre-push : $pass réussis, $fail en échec."
((fail == 0))
