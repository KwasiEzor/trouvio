#!/usr/bin/env bash
# Fonctions communes aux hooks Trouvio. Sourcé, pas exécuté.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Sans jq on ne peut pas lire l'événement : on bloque par précaution (fail closed).
require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "Hook Trouvio : jq est requis (brew install jq). Action bloquée par précaution." >&2
    exit 2
  fi
}

# Refus structuré d'un appel d'outil (PreToolUse).
deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Demande de confirmation humaine (PreToolUse).
ask() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

# Chemin relatif au projet.
rel_path() {
  local p="$1"
  case "$p" in
    "$PROJECT_DIR"/*) echo "${p#"$PROJECT_DIR"/}" ;;
    *) echo "$p" ;;
  esac
}

# Vrai si le nom de fichier est un .env secret (tout .env* et .envrc sauf .env.example), sans
# tenir compte de la casse : APFS (macOS) ouvre .ENV.LOCAL comme .env.local.
is_secret_env() {
  local base
  base="$(basename "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$base" == .env || "$base" == .env.* || "$base" == .envrc ]] && [[ "$base" != ".env.example" ]]
}
