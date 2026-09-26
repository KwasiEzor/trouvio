#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit) : refuse les motifs interdits par CLAUDE.md §5 dans le code TypeScript.
source "$(dirname "$0")/lib.sh"
require_jq
input="$(cat)"
file="$(jq -r '.tool_input.file_path // ""' <<<"$input")"
rel="$(rel_path "$file")"

case "$rel" in
  src/*.ts|src/*.tsx|db/*.ts|tests/*.ts|evals/*.ts|scripts/*.ts) ;;
  *) exit 0 ;;
esac

# Texte nouveau uniquement (Write: content ; Edit: new_string ; MultiEdit: edits[].new_string).
new="$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits // [] | .[].new_string)] | map(select(. != null)) | join("\n")' <<<"$input")"
[[ -z "$new" ]] && exit 0

is_test=false
[[ "$rel" =~ \.(test|spec)\.tsx?$ || "$rel" == tests/* ]] && is_test=true

problems=()
grep -Eq '@ts-(ignore|nocheck)' <<<"$new" && problems+=("@ts-ignore / @ts-nocheck")
grep -Eq '(:[[:space:]]*any([^A-Za-z0-9_]|$)|as[[:space:]]+any([^A-Za-z0-9_]|$)|<any>|any\[\])' <<<"$new" && problems+=("type any explicite (utiliser unknown + Zod)")
grep -Eq 'eslint-disable' <<<"$new" && problems+=("eslint-disable (corriger la cause)")
if [[ "$rel" == src/* && "$is_test" == false ]]; then
  grep -Eq 'console\.(log|debug|info)\(' <<<"$new" && problems+=("console.log (utiliser lib/logger)")
  grep -Eq 'process\.env' <<<"$new" && [[ "$rel" != src/lib/env.ts ]] && problems+=("process.env hors src/lib/env.ts")
  grep -Eq 'dangerouslySetInnerHTML' <<<"$new" && problems+=("dangerouslySetInnerHTML (contenu externe non fiable)")
fi
if [[ "$rel" == *.tsx ]]; then
  grep -Eq '(bg|text|border|fill|stroke|from|via|to|ring|outline|shadow|decoration)-\[#[0-9a-fA-F]{3,8}\]|(color|background|backgroundColor|borderColor|fill|stroke)[[:space:]]*:[[:space:]]*["'\'']#[0-9a-fA-F]{3,8}' <<<"$new" \
    && problems+=("couleur en dur (utiliser les tokens du thème)")
fi
if [[ "$is_test" == true ]]; then
  grep -Eq '\b(it|test|describe)\.(only|skip)\(|\bx(it|describe)\(' <<<"$new" && problems+=(".only / .skip dans un test")
fi

if ((${#problems[@]})); then
  msg="Refusé dans $rel : $(IFS='; '; echo "${problems[*]}"). Voir CLAUDE.md §5."
  deny "$msg"
fi
exit 0
