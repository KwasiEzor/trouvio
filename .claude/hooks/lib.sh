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

# Exécute sous sandbox-exec le code du dépôt qu'un hook lance (Prettier, next typegen, Vitest).
# Les hooks tournent hors du bac à sable de Claude Code et Claude peut modifier ce code : sans ce
# confinement, un test ou une config piégés liraient les .env (ADR 0011). Le profil refuse la
# lecture des .env (hors .env.example) et des secrets du dossier personnel, l'écriture hors du
# projet et des dossiers temporaires, l'écriture des garde-fous et le réseau hors localhost.
# Hors macOS (CI), la commande s'exécute telle quelle ; sur macOS sans sandbox-exec, jamais.
confine() {
  if [[ "$(uname -s)" != Darwin ]]; then
    "$@"
    return
  fi
  if [[ ! -x /usr/bin/sandbox-exec ]]; then
    echo "Hook Trouvio : sandbox-exec introuvable, « $1 » n'est pas exécuté (ADR 0011)." >&2
    return 126
  fi
  /usr/bin/sandbox-exec -p "$(confine_profile)" "$@"
}

# Profil Seatbelt de confine. La dernière règle qui s'applique l'emporte. Seatbelt compare le chemin
# canonique : un nom tapé en majuscules (APFS) retombe sur la règle ; la classe [eE][nN][vV] couvre
# en plus un fichier créé en majuscules.
confine_profile() {
  local root home rx
  root="$(cd "$PROJECT_DIR" && pwd -P)"
  home="$(cd "$HOME" && pwd -P)"
  rx="$(printf '%s' "$root" | sed -E 's/[][\.*^$()+?{}|]/\\&/g')"
  cat <<EOF
(version 1)
(allow default)
(deny file-read* file-write* (regex #"^$rx/\.[eE][nN][vV]"))
(allow file-read* (literal "$root/.env.example"))
(deny file-read* (subpath "$home/.ssh") (subpath "$home/.aws") (subpath "$home/.docker") (literal "$home/.netrc"))
(deny file-write* (require-not (require-any (subpath "$root") (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/dev"))))
(deny file-write* (subpath "$root/.claude") (subpath "$root/.githooks") (subpath "$root/.git/hooks") (literal "$root/.git/config"))
(deny network-outbound (remote ip "*:*"))
(allow network-outbound (remote ip "localhost:*"))
EOF
}

# Vrai si le nom de fichier est un .env secret (tout .env* et .envrc sauf .env.example), sans
# tenir compte de la casse : APFS (macOS) ouvre .ENV.LOCAL comme .env.local.
is_secret_env() {
  local base
  base="$(basename "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$base" == .env || "$base" == .env.* || "$base" == .envrc ]] && [[ "$base" != ".env.example" ]]
}
