#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit) : formate le fichier modifié avec Prettier (si installé). Ne bloque jamais.
source "$(dirname "$0")/lib.sh"
command -v jq >/dev/null 2>&1 || exit 0
file="$(jq -r '.tool_input.file_path // ""')"
[[ -z "$file" || ! -f "$file" ]] && exit 0
prettier="$PROJECT_DIR/node_modules/.bin/prettier"
[[ -x "$prettier" ]] || exit 0
case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.css|*.md|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac
case "$(rel_path "$file")" in
  db/migrations/*|pnpm-lock.yaml) exit 0 ;;
esac
"$prettier" --write --log-level warn "$file" >/dev/null 2>&1 || true
exit 0
