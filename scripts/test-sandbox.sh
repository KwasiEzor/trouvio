#!/usr/bin/env bash
# Sondes du bac à sable Bash de Claude Code (P0-08, ADR 0011) : aucune lecture d'un .env ne doit aboutir.
# Usage : bash scripts/test-sandbox.sh      (lancé par Claude, donc dans son bac à sable)
# Codes : 0 tout est confiné · 1 au moins une sonde en échec · 2 canari non garanti · 3 bac à sable inactif.
# Règle de sortie : la sortie d'une sonde est capturée puis cherchée pour le marqueur du canari,
# jamais affichée. .env.local n'est sondé que par code de retour, et seulement si le canari est
# resté illisible pour toutes les sondes.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

# Noms construits ici : le hook Bash refuse tout texte de commande qui les nomme.
E=".en""v"
CANARY="$ROOT/$E.canary"
LOCAL="$ROOT/$E.local"
EXAMPLE="$ROOT/$E.example"
MARK="canari-p0""-08-pas-un-secret"
CONTENT="TROUVIO_CANARI=$MARK"

# Preuve noyau (sandbox_check sur ce shell) et marque du bac à sable de Claude Code.
kernel="$(python3 -c 'import ctypes,sys; print(ctypes.CDLL(None).sandbox_check(int(sys.argv[1]), None, 0))' "$$" 2>/dev/null)"
if [[ "${SANDBOX_RUNTIME:-}" != 1 || "$kernel" != 1 ]]; then
  echo "Bac à sable inactif (SANDBOX_RUNTIME=${SANDBOX_RUNTIME:-absent}, sandbox_check=${kernel:-?}) : aucune sonde lancée."
  exit 3
fi
echo "Bac à sable actif : sandbox_check=1, SANDBOX_RUNTIME=1, TMPDIR=${TMPDIR:-?}"

# Présence d'un fichier à la racine par lecture du répertoire seulement (même stat est refusé sur un
# .env), sans tenir compte de la casse comme APFS.
listed() {
  local f want
  want="$(tr '[:upper:]' '[:lower:]' <<<"$1")"
  for f in "$ROOT"/.* "$ROOT"/*; do
    [[ "$(tr '[:upper:]' '[:lower:]' <<<"${f##*/}")" == "$want" ]] && return 0
  done
  return 1
}

# Canari : réécrit à chaque passage pour garantir son contenu, laissé en place (ignoré par git).
if ! printf '%s\n' "$CONTENT" >"$CANARY" 2>/dev/null || ! listed "$E.canary"; then
  echo "Canari impossible à écrire ici : son contenu n'est pas garanti, aucune sonde lancée."
  exit 2
fi

T="$(mktemp -d "${TMPDIR:-/tmp}/sonde-p008.XXXXXX")" || exit 1
UPPER_LOCAL="$(tr '[:lower:]' '[:upper:]' <<<"$E").SONDE.LOCAL"
trap 'rm -rf "$T" "$ROOT"/sonde-p008-*' EXIT
mkdir "$T/temoin"
CTRL="$T/temoin/temoin.txt"
printf '%s\n' "$CONTENT" >"$CTRL"
export ROOT T MARK CONTENT E

fails=0
total=0
report() { # <ok|ko> <libellé> [motif]
  total=$((total + 1))
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
  out="$(bash -c "$2" _ "$CTRL" 2>&1)"
  if [[ "$out" != *"$MARK"* ]]; then
    report ko "$1" "sonde inopérante sur le témoin"
    return
  fi
  out="$(bash -c "$2" _ "$CANARY" 2>&1)"
  if [[ "$out" == *"$MARK"* ]]; then report ko "$1" "canari lu"; else report ok "$1"; fi
}

# must_fail <libellé> <script> [nettoyage] : le script doit échouer (code ≠ 0), sortie jetée.
must_fail() {
  if bash -c "$2" >/dev/null 2>&1; then
    report ko "$1" "a réussi"
    [[ -n "${3:-}" ]] && bash -c "$3" >/dev/null 2>&1
  else
    report ok "$1"
  fi
}

# must_pass <libellé> <script> : contre-épreuve, le script doit réussir.
must_pass() {
  if bash -c "$2" >/dev/null 2>&1; then report ok "$1"; else report ko "$1" "a échoué"; fi
}

echo "--- Lecture du canari (chaque sonde doit échouer)"
reads "cat" 'cat -- "$1"'
reads "node -e" 'node -e "process.stdout.write(require(\"fs\").readFileSync(process.argv[1]))" "$1"'
reads "python3 open()" 'python3 -c "import sys; sys.stdout.write(open(sys.argv[1]).read())" "$1"'
reads "grep (premier niveau, fichiers cachés compris)" 'd="$(dirname "$1")"; grep -sh -d skip --exclude="$E.local" -e "$MARK" -- "$d"/.[!.]* "$d"/*'
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
  for probe in 'cat|cat -- "$1"' \
    'node -e|node -e "require(\"fs\").readFileSync(process.argv[1])" "$1"' \
    'python3 open()|python3 -c "import sys; open(sys.argv[1]).read()" "$1"' \
    'nom en majuscules|cat "$(dirname "$1")/$(basename "$1" | tr "[:lower:]" "[:upper:]")"'; do
    if bash -c "${probe#*|}" _ "$LOCAL" >/dev/null 2>&1; then
      report ko "$E.local : ${probe%%|*}" "lecture réussie"
    else
      report ok "$E.local : ${probe%%|*}"
    fi
  done
  must_fail "ouverture en ajout de $E.local (n'écrit rien)" ': >>"$ROOT/$E.local"'
fi

echo "--- Seed personnel db/seed.local.json (plan P1-01, Q5)"
SEED="$ROOT/db/seed.local.json"
seed_listed() {
  local f
  for f in "$ROOT"/db/*; do [[ "${f##*/}" == seed.local.json ]] && return 0; done
  return 1
}
if seed_listed; then
  # Fichier réel de l'utilisateur : jamais réécrit, sondé par code de retour seul.
  must_fail "db/seed.local.json : cat" 'cat -- "$ROOT/db/seed.local.json"'
  must_fail "db/seed.local.json : node -e" 'node -e "require(\"fs\").readFileSync(process.argv[1])" "$ROOT/db/seed.local.json"'
else
  # Pas de canari à sa place : le bac à sable refuse aussi de supprimer un fichier qu'il ne peut
  # pas lire, le canari resterait (mesuré le 2026-10-01).
  echo "SAUTÉ   db/seed.local.json absent"
fi

echo "--- Contre-épreuves (doivent réussir)"
if [[ -n "$(cat -- "$EXAMPLE" 2>/dev/null)" ]]; then report ok "lecture de $E.example"; else report ko "lecture de $E.example"; fi
out="$(bash -c 'f="$ROOT/sonde-p008-ecriture"; echo "$MARK" >"$f" && cat "$f"; rm -f "$f"' 2>&1)"
if [[ "$out" == *"$MARK"* ]]; then report ok "écriture et lecture d'un fichier du dépôt"; else report ko "écriture et lecture d'un fichier du dépôt"; fi
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://registry.npmjs.org/ 2>/dev/null)"
if [[ "$code" == 200 ]]; then report ok "registry.npmjs.org par le proxy (200)"; else report ko "registry.npmjs.org par le proxy" "code $code"; fi
must_pass "node (runtime sous ~, lecture permise)" 'node -e "process.exit(0)"'
must_pass "git lit ~/.gitconfig" 'git config --global --get user.name'

echo "--- Confinement (doit échouer)"
must_fail "lecture du dossier personnel (~)" 'ls "$HOME"'
must_fail "lecture de ~/.zshrc" 'cat "$HOME/.zshrc"'
must_fail "trousseau de session invisible (aucun jeton joignable)" 'security default-keychain'
if listed "$UPPER_LOCAL"; then
  echo "SAUTÉ   $UPPER_LOCAL existe déjà"
else
  must_fail "création de $UPPER_LOCAL (nom .env en majuscules)" ': >"$ROOT/'"$UPPER_LOCAL"'"' 'rm -f "$ROOT/'"$UPPER_LOCAL"'"'
fi
must_fail "écriture dans ~ (hors dépôt)" 'touch "$HOME/.trouvio-sonde-p008"' 'rm -f "$HOME/.trouvio-sonde-p008"'
must_fail "écriture dans le store pnpm" 'touch "$HOME/Library/pnpm/store/sonde-p008"' 'rm -f "$HOME/Library/pnpm/store/sonde-p008"'
must_fail "écriture dans node_modules/" 'touch "$ROOT/node_modules/.sonde-p008"' 'rm -f "$ROOT/node_modules/.sonde-p008"'
must_fail "écriture dans .githooks/" 'touch "$ROOT/.githooks/sonde-p008"' 'rm -f "$ROOT/.githooks/sonde-p008"'
must_fail "écriture dans .git/hooks/" 'touch "$ROOT/.git/hooks/sonde-p008"' 'rm -f "$ROOT/.git/hooks/sonde-p008"'
must_fail "écriture dans .claude/hooks/" 'touch "$ROOT/.claude/hooks/sonde-p008"' 'rm -f "$ROOT/.claude/hooks/sonde-p008"'
must_fail "connexion directe (sans proxy)" 'curl -s -o /dev/null --max-time 10 --noproxy "*" https://github.com'

echo "Bac à sable : $total sondes, $fails en échec."
((fails == 0)) || exit 1
exit 0
