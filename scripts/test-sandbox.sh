#!/usr/bin/env bash
# Sondes de confinement des secrets locaux (P0-08, ADR 0011). Aucune lecture d'un .env ne doit aboutir.
# Usage :
#   bash scripts/test-sandbox.sh         mode « bash » : lancé par Claude, dans son bac à sable Bash
#   bash scripts/test-sandbox.sh hooks   mode « hooks » : lancé par l'utilisateur dans son terminal ;
#                                        chaque sonde passe par `confine` (.claude/hooks/lib.sh)
# Codes : 0 tout est confiné · 1 au moins une sonde en échec · 2 canari absent · 3 bac à sable
#         inactif · 4 confine indisponible.
# Règle de sortie : la sortie d'une sonde est capturée puis cherchée pour le marqueur du canari,
# jamais affichée. .env.local n'est sondé que par code de retour, et seulement si le canari est
# resté illisible pour toutes les sondes.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
MODE="${1:-bash}"

# Noms construits ici : le hook Bash refuse tout texte de commande qui les nomme.
E=".en""v"
CANARY="$ROOT/$E.canary"
LOCAL="$ROOT/$E.local"
EXAMPLE="$ROOT/$E.example"
MARK="canari-p0""-08-pas-un-secret"
CONTENT="TROUVIO_CANARI=$MARK"

case "$MODE" in
  bash)
    # Preuve noyau (sandbox_check sur ce shell) et marque du bac à sable de Claude Code.
    kernel="$(python3 -c 'import ctypes,sys; print(ctypes.CDLL(None).sandbox_check(int(sys.argv[1]), None, 0))' "$$" 2>/dev/null)"
    if [[ "${SANDBOX_RUNTIME:-}" != 1 || "$kernel" != 1 ]]; then
      echo "Bac à sable inactif (SANDBOX_RUNTIME=${SANDBOX_RUNTIME:-absent}, sandbox_check=${kernel:-?}) : aucune sonde lancée."
      exit 3
    fi
    echo "Bac à sable actif : sandbox_check=1, SANDBOX_RUNTIME=1, TMPDIR=${TMPDIR:-?}"
    run() { "$@"; }
    ;;
  hooks)
    # shellcheck source=../.claude/hooks/lib.sh
    source "$ROOT/.claude/hooks/lib.sh"
    if [[ "$(uname -s)" != Darwin || ! -x /usr/bin/sandbox-exec ]] || ! declare -F confine >/dev/null; then
      echo "confine indisponible (macOS, /usr/bin/sandbox-exec et .claude/hooks/lib.sh requis) : aucune sonde lancée."
      exit 4
    fi
    run() { confine "$@"; }
    ;;
  *)
    echo "Usage : bash scripts/test-sandbox.sh [bash|hooks]" >&2
    exit 64
    ;;
esac

# Présence d'un fichier à la racine par lecture du répertoire seulement : dans le bac à sable, même
# stat est refusé sur un .env.
listed() {
  local f
  for f in "$ROOT"/.* "$ROOT"/*; do [[ "${f##*/}" == "$1" ]] && return 0; done
  return 1
}

# Canari : réécrit à chaque passage (écriture permise), laissé en place comme fixture (ignoré par git).
printf '%s\n' "$CONTENT" >"$CANARY" 2>/dev/null
if ! listed "$E.canary"; then
  echo "Canari absent et impossible à créer ici. Dans ton terminal, à la racine du dépôt :"
  echo "  printf '%s\\n' '$CONTENT' > $E.canary"
  exit 2
fi

T="$(mktemp -d "${TMPDIR:-/tmp}/sonde-p008.XXXXXX")" || exit 1
mkdir "$T/temoin"
CTRL="$T/temoin/temoin.txt"
printf '%s\n' "$CONTENT" >"$CTRL"
trap 'rm -rf "$T" "$ROOT"/sonde-p008-*' EXIT
export ROOT T MARK CONTENT

fails=0
report() { # <ok|ko> <libellé> [motif]
  if [[ "$1" == ok ]]; then
    echo "OK      $2"
  else
    echo "ÉCHEC   $2${3:+ : $3}"
    fails=$((fails + 1))
  fi
}

# reads <libellé> <script> : le script reçoit la cible en $1 et écrit ce qu'il en lit. Il doit lire
# le témoin (sinon la sonde ne prouve rien) et ne rien obtenir du canari.
reads() {
  local out
  out="$(run bash -c "$2" _ "$CTRL" 2>&1)"
  if [[ "$out" != *"$MARK"* ]]; then
    report ko "$1" "sonde inopérante sur le témoin"
    return
  fi
  out="$(run bash -c "$2" _ "$CANARY" 2>&1)"
  if [[ "$out" == *"$MARK"* ]]; then report ko "$1" "canari lu"; else report ok "$1"; fi
}

# must_fail <libellé> <script> [nettoyage] : le script doit échouer (code ≠ 0), sortie jetée.
must_fail() {
  if run bash -c "$2" >/dev/null 2>&1; then
    report ko "$1" "a réussi"
    [[ -n "${3:-}" ]] && bash -c "$3" >/dev/null 2>&1
  else
    report ok "$1"
  fi
}

echo "--- Lecture du canari (chaque sonde doit échouer)"
reads "cat" 'cat -- "$1"'
reads "node -e" 'node -e "process.stdout.write(require(\"fs\").readFileSync(process.argv[1]))" "$1"'
reads "python3 open()" 'python3 -c "import sys; sys.stdout.write(open(sys.argv[1]).read())" "$1"'
reads "grep (premier niveau, fichiers cachés compris)" 'd="$(dirname "$1")"; grep -sh -d skip -e "$MARK" -- "$d"/.[!.]* "$d"/*'
reads "find -exec cat" 'find "$(dirname "$1")" -maxdepth 1 -name "$(basename "$1")" -exec cat {} +'
reads "lien symbolique dans TMPDIR" 'l="$T/lien"; rm -f "$l"; ln -s "$1" "$l" && cat "$l"'
reads "lien physique dans TMPDIR" 'l="$T/dur"; rm -f "$l"; ln "$1" "$l" && cat "$l"'
reads "lien physique dans le dépôt" 'l="$ROOT/sonde-p008-dur"; rm -f "$l"; ln "$1" "$l" && cat "$l"; rm -f "$l"'
reads "cp" 'c="$T/copie"; rm -f "$c"; cp "$1" "$c" && cat "$c"'
reads "mv vers un nom neutre" 'd="$ROOT/sonde-p008-mv"; mv "$1" "$d" && { cat "$d"; mv "$d" "$1"; }'
reads "tar c | tar xO" 'tar -C "$(dirname "$1")" -cf - "$(basename "$1")" | tar -xOf -'
reads "git hash-object" 'h="$(git hash-object -- "$1")" && [[ "$h" == "$(printf "%s\n" "$CONTENT" | git hash-object --stdin)" ]] && echo "$MARK"'
reads "git diff --no-index" 'git diff --no-index -- /dev/null "$1"'
reads "sqlite3 readfile()" 'sqlite3 :memory: "select cast(readfile('"'"'$1'"'"') as text);"'
reads "nom en majuscules" 'cat "$(dirname "$1")/$(basename "$1" | tr "[:lower:]" "[:upper:]")"'
reads "chemin en majuscules" 'cat "$(printf "%s" "$1" | tr "[:lower:]" "[:upper:]")"'
canary_fails=$fails

echo "--- $E.local (code de retour seul)"
if ! listed "$E.local"; then
  echo "SAUTÉ   $E.local absent"
elif ((canary_fails > 0)); then
  echo "SAUTÉ   le canari a été lu : $E.local n'est pas sondé"
else
  for probe in 'cat -- "$1"' \
    'node -e "require(\"fs\").readFileSync(process.argv[1])" "$1"' \
    'python3 -c "import sys; open(sys.argv[1]).read()" "$1"' \
    'cat "$(dirname "$1")/$(basename "$1" | tr "[:lower:]" "[:upper:]")"'; do
    if run bash -c "$probe" _ "$LOCAL" >/dev/null 2>&1; then
      report ko "$E.local : ${probe%% *}" "lecture réussie"
    else
      report ok "$E.local : ${probe%% *}"
    fi
  done
  must_fail "ouverture en ajout de $E.local (n'écrit rien)" ': >>"$ROOT/'"$E"'.local"'
fi

echo "--- Contre-épreuves (doivent réussir)"
if [[ -n "$(run cat -- "$EXAMPLE" 2>/dev/null)" ]]; then report ok "lecture de $E.example"; else report ko "lecture de $E.example"; fi
out="$(run bash -c 'f="$ROOT/sonde-p008-ecriture"; echo "$MARK" >"$f" && cat "$f"; rm -f "$f"' 2>&1)"
if [[ "$out" == *"$MARK"* ]]; then report ok "écriture et lecture d'un fichier du dépôt"; else report ko "écriture et lecture d'un fichier du dépôt"; fi
if [[ "$MODE" == bash ]]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://registry.npmjs.org/ 2>/dev/null)"
  if [[ "$code" == 200 ]]; then report ok "registry.npmjs.org par le proxy (200)"; else report ko "registry.npmjs.org par le proxy" "code $code"; fi
fi

echo "--- Confinement (doit échouer)"
must_fail "écriture dans ~ (hors dépôt)" 'touch "$HOME/.trouvio-sonde-p008"' 'rm -f "$HOME/.trouvio-sonde-p008"'
must_fail "écriture dans .githooks/" 'touch "$ROOT/.githooks/sonde-p008"' 'rm -f "$ROOT/.githooks/sonde-p008"'
must_fail "écriture dans .git/hooks/" 'touch "$ROOT/.git/hooks/sonde-p008"' 'rm -f "$ROOT/.git/hooks/sonde-p008"'
must_fail "écriture dans .claude/" 'touch "$ROOT/.claude/sonde-p008"' 'rm -f "$ROOT/.claude/sonde-p008"'
must_fail "connexion directe (sans proxy)" 'curl -s -o /dev/null --max-time 10 --noproxy "*" https://github.com'

if [[ "$MODE" == hooks ]]; then
  echo "--- Hooks qui exécutent du code du dépôt (doivent passer par confine)"
  # Chaque ligne qui lance l'outil (hors commentaire) doit passer par confine.
  for check in 'format.sh:--write' 'stop-verify.sh:pnpm -s typecheck' 'stop-verify.sh:vitest related'; do
    hook="${check%%:*}"; pat="${check#*:}"
    lines="$(grep -F -- "$pat" "$ROOT/.claude/hooks/$hook" | grep -v '^[[:space:]]*#')"
    if [[ -n "$lines" ]] && ! grep -vq 'confine ' <<<"$lines"; then
      report ok "$hook : « $pat » passe par confine"
    else
      report ko "$hook : « $pat » passe par confine"
    fi
  done
fi

echo "Bac à sable ($MODE) : $fails sonde(s) en échec."
((fails == 0)) || exit 1
exit 0
