#!/usr/bin/env bash
# PreToolUse(Read|Edit|Write|MultiEdit|NotebookEdit|Grep) : protège secrets, migrations commitées
# et garde-fous.
source "$(dirname "$0")/lib.sh"
require_jq
input="$(cat)"
tool="$(jq -r '.tool_name // ""' <<<"$input")"
file="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // ""' <<<"$input")"

# Vrai si le chemin, ou la cible d'un lien symbolique, est un fichier d'environnement secret.
secret_target() {
  [[ -z "$1" ]] && return 1
  is_secret_env "$1" && return 0
  [[ -e "$1" ]] && is_secret_env "$(realpath "$1" 2>/dev/null || echo "$1")"
}

if secret_target "$file"; then
  deny "Accès à $(rel_path "$file") interdit (secrets, CLAUDE.md §6). Utiliser .env.example pour documenter les variables."
fi

# Grep : rg --glob passe outre .gitignore et « * » y attrape le point initial. Refusé : un joker
# dont le dernier segment couvre un nom de fichier d'environnement (sans tenir compte de la casse),
# ou une alternative {…} dont un membre commence par un point ou par « env ».
if [[ "$tool" == "Grep" ]]; then
  glob="$(jq -r '.tool_input.glob // ""' <<<"$input")"
  seg="${glob##*/}"
  if [[ -n "$seg" ]]; then
    shopt -s nocasematch
    for nom in .env .env.local .env.development .env.development.local .env.test .env.test.local \
      .env.production .env.production.local .envrc; do
      # shellcheck disable=SC2053 # $seg est volontairement un motif
      if [[ "$nom" == $seg ]]; then
        deny "Grep : ce joker couvre un fichier .env (rg ignore alors .gitignore). Restreindre le joker."
      fi
    done
    shopt -u nocasematch
  fi
  if [[ "$glob" =~ [{,][[:space:]]*(\.|[eE][nN][vV]) ]]; then
    deny "Grep : alternative {…} qui vise un fichier caché ou .env. Restreindre le joker."
  fi
  exit 0
fi

[[ -z "$file" ]] && exit 0
rel="$(rel_path "$file")"

[[ "$tool" == "Read" ]] && exit 0

# Migrations déjà commitées : immuables.
if [[ "$rel" == db/migrations/* ]] && git -C "$PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  deny "La migration $rel est déjà commitée : ne jamais la modifier, générer une nouvelle migration (pnpm db:generate)."
fi

# Prompts publiés : immuables (nouvelle version obligatoire).
if [[ "$rel" =~ ^prompts/scoring\.v[0-9]+\.md$ ]] && git -C "$PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  deny "$rel est une version publiée : créer prompts/scoring.vN+1.md puis lancer /eval-scoring (.claude/rules/llm.md)."
fi

# Garde-fous eux-mêmes, et fichiers d'où Claude Code, git ou l'éditeur exécutent du code hors du bac
# à sable (serveurs MCP, tâches VS Code, config et hooks git) : modification jamais silencieuse.
if [[ "$rel" == .claude/hooks/* || "$rel" == .claude/settings.json || "$rel" == .github/workflows/* || "$rel" == .githooks/* \
  || "$rel" == .mcp.json || "$rel" == .vscode/* || "$rel" == .git/* ]]; then
  ask "Modification d'un garde-fou ($rel) : confirmation humaine requise."
fi

exit 0
