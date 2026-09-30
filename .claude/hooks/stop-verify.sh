#!/usr/bin/env bash
# Stop : si du TypeScript a changé depuis la dernière vérification verte, demande à Claude de lancer
# scripts/verifie-modifs.sh dans son bac à sable avant de rendre la main.
# N'exécute aucun code du dépôt (git seulement) : les hooks tournent hors du bac à sable (ADR 0011).
source "$(dirname "$0")/lib.sh"
command -v jq >/dev/null 2>&1 || exit 0
input="$(cat)"
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0

cd "$PROJECT_DIR" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[[ -z "$(changed_ts)" ]] && exit 0

state="$PROJECT_DIR/.claude/state/last-green"
[[ -f "$state" && "$(cat "$state")" == "$(changes_fingerprint)" ]] && exit 0

echo "TypeScript modifié depuis la dernière vérification verte : lance « bash scripts/verifie-modifs.sh » (formatage, typecheck, tests liés) et corrige avant de terminer." >&2
exit 2
