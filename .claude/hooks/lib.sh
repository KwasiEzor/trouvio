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

# Fichiers TypeScript modifiés (suivis ou nouveaux) par rapport à HEAD, hors node_modules et .next.
# Git seulement : les hooks tournent hors du bac à sable et n'exécutent aucun code du dépôt (ADR 0011).
changed_ts() {
  { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard; } \
    | grep -E '\.(ts|tsx)$' | grep -Ev '^(node_modules|\.next)/' | sort -u
}

# Empreinte des fichiers TypeScript modifiés (chemin et contenu), notée par scripts/verifie-modifs.sh
# après une vérification verte et comparée par le hook Stop.
changes_fingerprint() {
  local f
  changed_ts | while IFS= read -r f; do
    if [[ -f "$f" ]]; then echo "$f $(git hash-object -- "$f")"; else echo "$f supprimé"; fi
  done | shasum | cut -d' ' -f1
}

# Vrai si le nom de fichier est un .env secret (tout .env* et .envrc sauf .env.example), sans
# tenir compte de la casse : APFS (macOS) ouvre .ENV.LOCAL comme .env.local.
is_secret_env() {
  local base
  base="$(basename "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$base" == .env || "$base" == .env.* || "$base" == .envrc ]] && [[ "$base" != ".env.example" ]]
}
