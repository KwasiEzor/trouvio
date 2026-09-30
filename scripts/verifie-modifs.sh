#!/usr/bin/env bash
# Vérifie les fichiers modifiés et note l'empreinte qu'attend le hook Stop (.claude/hooks/stop-verify.sh).
# Lancé par Claude, donc dans son bac à sable (ADR 0011) : formate les fichiers modifiés (Prettier),
# puis, si du TypeScript a changé, vérifie les types et lance les tests liés.
# Usage : bash scripts/verifie-modifs.sh     (code ≠ 0 si une étape échoue ; aucune empreinte alors)
source "$(dirname "$0")/../.claude/hooks/lib.sh"
cd "$PROJECT_DIR" || exit 1

files=()
while IFS= read -r f; do
  [[ -f "$f" ]] && files+=("$f")
done < <({ git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard; } | sort -u \
  | grep -E '\.(ts|tsx|js|mjs|cjs|json|css|md|yml|yaml)$' | grep -Ev '^(node_modules|\.next|db/migrations)/|^pnpm-lock\.yaml$')
if ((${#files[@]} > 0)); then
  node_modules/.bin/prettier --write --log-level warn "${files[@]}" || exit 1
fi

ts="$(changed_ts)"
if [[ -n "$ts" ]]; then
  pnpm -s typecheck || exit 1
  existing="$(while IFS= read -r f; do [[ -f "$f" ]] && echo "$f"; done <<<"$ts")"
  if [[ -n "$existing" ]]; then
    # shellcheck disable=SC2086
    node_modules/.bin/vitest related --run --passWithNoTests $existing || exit 1
  fi
fi

mkdir -p .claude/state && changes_fingerprint >.claude/state/last-green
echo "Vérification verte : empreinte notée pour le hook Stop."
