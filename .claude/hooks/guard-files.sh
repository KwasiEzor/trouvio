#!/usr/bin/env bash
# PreToolUse(Read|Edit|Write|MultiEdit|NotebookEdit) : protège secrets, migrations commitées et garde-fous.
source "$(dirname "$0")/lib.sh"
require_jq
input="$(cat)"
tool="$(jq -r '.tool_name // ""' <<<"$input")"
file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")"
[[ -z "$file" ]] && exit 0
rel="$(rel_path "$file")"

if is_secret_env "$file"; then
  deny "Accès à $rel interdit (secrets, CLAUDE.md §6). Utiliser .env.example pour documenter les variables."
fi

[[ "$tool" == "Read" ]] && exit 0

# Migrations déjà commitées : immuables.
if [[ "$rel" == db/migrations/* ]] && git -C "$PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  deny "La migration $rel est déjà commitée : ne jamais la modifier, générer une nouvelle migration (pnpm db:generate)."
fi

# Prompts publiés : immuables (nouvelle version obligatoire).
if [[ "$rel" =~ ^prompts/scoring\.v[0-9]+\.md$ ]] && git -C "$PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  deny "$rel est une version publiée : créer prompts/scoring.vN+1.md puis lancer /eval-scoring (.claude/rules/llm.md)."
fi

# Garde-fous eux-mêmes : modification possible mais jamais silencieuse.
if [[ "$rel" == .claude/hooks/* || "$rel" == .claude/settings.json || "$rel" == .github/workflows/* || "$rel" == .githooks/* ]]; then
  ask "Modification d'un garde-fou ($rel) : confirmation humaine requise."
fi

exit 0
