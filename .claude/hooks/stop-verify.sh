#!/usr/bin/env bash
# Stop : si du code TypeScript a changé, exige typecheck + tests liés verts avant de rendre la main.
# Rapide : ne s'exécute que sur changement, et saute si l'état n'a pas bougé depuis le dernier succès.
source "$(dirname "$0")/lib.sh"
command -v jq >/dev/null 2>&1 || exit 0
input="$(cat)"
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0

cd "$PROJECT_DIR" || exit 0
[[ -f package.json && -d node_modules ]] || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

changed="$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | grep -Ev '^(node_modules|\.next)/' | sort -u)"
[[ -z "$changed" ]] && exit 0

state_dir="$PROJECT_DIR/.claude/state"; mkdir -p "$state_dir"
fingerprint="$( { echo "$changed"; git diff HEAD -- $changed 2>/dev/null; } | shasum | cut -d' ' -f1)"
[[ -f "$state_dir/last-green" && "$(cat "$state_dir/last-green")" == "$fingerprint" ]] && exit 0

log="$state_dir/stop-verify.log"
# next typegen (next.config.ts) et Vitest exécutent du code du dépôt : confinés (ADR 0011).
if jq -e '.scripts.typecheck' package.json >/dev/null 2>&1; then
  if ! confine pnpm -s typecheck >"$log" 2>&1; then
    { echo "typecheck en échec — corrige avant de terminer :"; tail -n 30 "$log"; } >&2
    exit 2
  fi
fi

existing="$(for f in $changed; do [[ -f "$f" ]] && echo "$f"; done)"
if [[ -n "$existing" && -x node_modules/.bin/vitest ]]; then
  # shellcheck disable=SC2086
  if ! confine node_modules/.bin/vitest related --run --passWithNoTests $existing >"$log" 2>&1; then
    { echo "Tests liés aux fichiers modifiés en échec — corrige avant de terminer :"; tail -n 40 "$log"; } >&2
    exit 2
  fi
fi

echo "$fingerprint" >"$state_dir/last-green"
exit 0
