#!/usr/bin/env bash
# PreToolUse(Bash) : bloque les commandes dangereuses ou contraires à CLAUDE.md §6.
# Filet contre les formes plausibles, pas une frontière : il ne voit que le texte de la commande.
# La frontière est le bac à sable Bash de Claude Code (ADR 0011), qui confine aussi les descendants.
source "$(dirname "$0")/lib.sh"
require_jq
cmd="$(jq -r '.tool_input.command // ""')"

# Deux lectures de la commande, sans les corps de heredoc (texte littéral, jamais exécuté) :
# - « globs » : guillemets retirés, métacaractères de joker neutralisés entre guillemets ou après
#   un antislash (le shell ne les y développe pas) ; « ".e"* » reste donc un joker ;
# - « bare » : chaque chaîne entre guillemets remplacée par Q, pour lire les options sans les motifs.
# Suivi comme le shell : antislash, '…', "…", $'…' (l'antislash y échappe l'apostrophe), contextes
# $( … ) et `…` (même entre guillemets doubles), commentaires #, heredocs hors guillemets (<<<
# exclu, <<\EOF reconnu). Découpage ambigu à la fin (guillemet, $( ou heredoc non fermé) : __DESYNC__.
normalize() { # <globs|bare>
  printf '%s\n' "$cmd" | awk -v mode="$1" -v sq="'" '
    function keep(ch) { if (ch ~ /[][*?{}]/) ch = "_"; out = out ch }
    BEGIN { q = ""; d = 0; hd = ""; nhd = ""; hdre = "^-?[ \t]*\\\\?[\"" sq "]?[A-Za-z_][A-Za-z0-9_]*" }
    {
      line = $0
      if (hd != "") { t = line; if (strip) sub(/^\t+/, "", t); if (t == hd) hd = ""; next }
      out = ""; n = length(line)
      for (i = 1; i <= n; i++) {
        c = substr(line, i, 1); nx = substr(line, i + 1, 1); pv = (i > 1) ? substr(line, i - 1, 1) : ""
        if (q == "A") {
          if (c == "\\" && i < n) { i++; if (mode == "globs") keep(substr(line, i, 1)); continue }
          if (c == sq) { q = ""; continue }
          if (mode == "globs") keep(c)
          continue
        }
        if (q != sq && c == "\\" && i < n) { i++; if (q != "" && mode == "bare") continue; keep(substr(line, i, 1)); continue }
        if (q == sq) { if (c == sq) q = ""; else if (mode == "globs") keep(c); continue }
        # Hors apostrophes : q vaut "" ou le guillemet double.
        if (c == "$" && nx == "(") { d++; st[d] = q; bt[d] = 0; pc[d] = 0; q = ""; out = out "$("; i++; continue }
        if (c == "`") {
          if (q == "" && d > 0 && bt[d]) { q = st[d]; d--; out = out "`"; continue }
          d++; st[d] = q; bt[d] = 1; pc[d] = 0; q = ""; out = out "`"; continue
        }
        if (q == "\"") { if (c == "\"") q = ""; else if (mode == "globs") keep(c); continue }
        # Hors de toute chaîne.
        if (d > 0 && !bt[d] && c == "(") pc[d]++
        if (d > 0 && !bt[d] && c == ")") { if (pc[d] > 0) pc[d]--; else { q = st[d]; d--; out = out ")"; continue } }
        if (c == "#" && (pv == "" || pv ~ /[ \t;&|(]/)) break
        if (c == "$" && nx == sq) { q = "A"; i++; if (mode == "bare") out = out "Q"; continue }
        if (c == sq || c == "\"") { q = c; if (mode == "bare") out = out "Q"; continue }
        if (c == "<" && nx == "<" && pv != "<" && substr(line, i + 2, 1) != "<" && match(substr(line, i + 2), hdre)) {
          h = substr(line, i + 2, RLENGTH); nstrip = (h ~ /^-/)
          sub(/^-?[ \t]*/, "", h); gsub(/[\\"]/, "", h); gsub(sq, "", h); nhd = h
        }
        out = out c
      }
      print out
      if (nhd != "") { hd = nhd; strip = nstrip; nhd = "" }
    }
    END { if (q != "" || d > 0 || hd != "") print "__DESYNC__" }'
}
globs="$(normalize globs)"
bare="$(normalize bare)"
has() { printf '%s' "$2" | grep -Eq -- "$1"; }             # <regex> <texte>
has_i() { printf '%s' "$2" | grep -Eqi -- "$1"; }
# Début d'une commande simple : début de ligne, séparateur, sous-shell, espace ou chemin (/usr/bin/…).
S='(^|[;&|(`[:space:]/])'

if [[ "$globs$bare" == *__DESYNC__* ]]; then
  deny "Découpage de la commande ambigu (guillemet, \$( ou heredoc non fermé) : refusée par précaution."
fi

# --- Secrets : fichiers .env (hors .env.example) et environnement ---
# APFS ignore la casse : .ENV.LOCAL ouvre .env.local. Le nom est cherché dans la commande brute et
# dans la lecture « globs » (guillemets et antislashs résolus : .e''nv, .en\v).
no_example() { printf '%s \n' "$1" | sed -E 's/\.[eE][nN][vV]\.[eE][xX][aA][mM][pP][lL][eE]([^A-Za-z0-9_.-])/\1/g'; }
R1='(^|[^A-Za-z0-9_$.-])\.env([^A-Za-z0-9_]|$)|\.envrc'
if has_i "$R1" "$(no_example "$cmd")" || has_i "$R1" "$(no_example "$globs")"; then
  deny "Accès aux fichiers .env interdit (CLAUDE.md §6). Seul .env.example est manipulable."
fi
if has '(^|[[:space:]/=<>|;&(])\.[^[:space:]/]*[][*?{]' "$globs" || has '\*\([^)]*D[^)]*\)' "$globs"; then
  deny "Joker sur des fichiers cachés (il atteindrait les .env). Nommer les fichiers, ou utiliser git grep."
fi
if has_i "${S}setopt[[:space:]]+[^;&|]*glob_?dots|${S}shopt[[:space:]]+-s[[:space:]]+[^;&|]*dotglob" "$bare"; then
  deny "Inclure les fichiers cachés dans les jokers exposerait les .env."
fi
if has_i "(nv|[})\"']v)\.(local|development|production)([^A-Za-z0-9_]|$)|nv\.test\.local" "$cmd"; then
  deny "Nom de fichier .env reconstruit : accès interdit (CLAUDE.md §6)."
fi
if has "\\\$'[^']*\\\\(x2[eE]|0?56|u002[eE]|U0000002[eE])" "$cmd"; then
  deny "Point encodé (\$'…') dans un nom de fichier : accès interdit aux fichiers cachés."
fi
bare_ng="$(printf '%s' "$bare" | sed -E 's/git[[:space:]]+grep/git-grep/g')"
if has "${S}(e|f)?grep([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(-[A-Za-z0-9]*[rR][A-Za-z0-9]*|--recursive|--dereference-recursive|--directories(=|[[:space:]]+)recurse|-d[[:space:]]*recurse)([[:space:];&|]|$)" "$bare_ng"; then
  deny "Recherche récursive interdite (elle lirait les .env ignorés). Utiliser git grep (fichiers suivis) ou l'outil Grep."
fi
if has "${S}rg([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(-[A-Za-z0-9]*[ug][A-Za-z0-9]*|--unrestricted|--no-ignore[A-Za-z-]*|--i?glob([=[:space:]]|$))" "$bare" \
  || has 'RIPGREP_CONFIG_PATH' "$cmd"; then
  deny "rg sans ses règles d'ignorance (-u, --no-ignore, -g) atteindrait les .env. Utiliser rg sans ces options, ou git grep."
fi
if has "git[[:space:]]+grep[^;&|]*(--no-index|--no-exclude-standard)" "$bare"; then
  deny "git grep hors des fichiers suivis lirait les .env ignorés."
fi
if has "${S}gitleaks[[:space:]]+(dir|directory|stdin)([[:space:]]|$)|${S}gitleaks[[:space:]]+detect[^;&|]*--no-git" "$bare"; then
  deny "gitleaks sur l'arbre de travail lirait les .env : utiliser gitleaks git (commits seulement)."
fi
if has "${S}(env|printenv)([[:space:]]+-[-0-9A-Za-z]+)*[[:space:]]*(\$|[;&|)])|${S}printenv([[:space:]]|\$)" "$bare" \
  || has "${S}(declare|typeset)([[:space:]]+-[A-Za-z]*[px][A-Za-z]*)?[[:space:]]*(\$|[;&|)])|${S}(declare|typeset|local)[[:space:]]+-[A-Za-z]*p" "$bare" \
  || has "${S}compgen[[:space:]]+-[A-Za-z]*[ve]" "$bare" \
  || has '(^|[;&|(][[:space:]]*)(set|export|export -p)[[:space:]]*($|[;&|)])' "$bare"; then
  deny "Afficher l'environnement exposerait des secrets."
fi
# Trousseau : le bac à sable le laisse joignable (git et gh s'en servent), le hook refuse d'en extraire.
if has "${S}gh[[:space:]]+auth[[:space:]]+token([[:space:];&|)]|\$)" "$globs" \
  || has "${S}gh[[:space:]]+auth[[:space:]]+status[^;&|]*[[:space:]](--show-token|-[A-Za-z]*t[A-Za-z]*)([[:space:];&|)]|\$)" "$globs" \
  || has "${S}security[[:space:]]+(find-[a-z-]*password|dump-keychain)([[:space:];&|)]|\$)" "$globs" \
  || has "${S}git[[:space:]]+credential[[:space:]]+fill|${S}git([[:space:]]+|-)credential-[a-z]+[[:space:]]+get([[:space:];&|)]|\$)" "$globs"; then
  deny "Extraire un jeton ou un mot de passe du trousseau exposerait un secret (ADR 0011)."
fi

# --- Exécution détournée par awk ou sed (commandes autorisées sans confirmation) ---
if has "${S}[gmn]?awk([[:space:]]|$)" "$bare"; then
  if has 'system[[:space:]]*\(|getline|ENVIRON|(^|[^A-Za-z_])printf?([[:space:]][^;}]*)?[|>]' "$cmd" \
    || has "${S}[gmn]?awk([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-f|--file)([[:space:]=]|$)" "$bare"; then
    deny "awk ne doit ni lancer de commande (system, getline, tube), ni lire l'environnement, ni écrire de fichier, ni charger un script."
  fi
fi
# sed : seuls les segments (entre && et ||) qui appellent sed sont examinés, pour qu'un « 2e » ou un
# « w » dans une autre commande ne compte pas.
sed_segments="$(printf '%s\n' "$cmd" | awk '{ gsub(/&&|\|\|/, "\n"); print }' | grep -E "${S}g?sed([[:space:]]|\$)" || true)"
if [[ -n "$sed_segments" ]]; then
  if has "/[gpIiMm0-9]*e[gpIiMm0-9]*[[:space:]]*(['\";}]|\$)|(^|[;{}'\"[:space:]]|[0-9\$/])[eEwW][[:space:]]+[^[:space:]'\"]" "$sed_segments" \
    || has "${S}g?sed([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(-f|--file)([[:space:]=]|\$)" "$bare"; then
    deny "sed ne doit ni lancer de commande (e), ni écrire de fichier (w), ni charger un script (-f)."
  fi
fi

# --- Git ---
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^;&|]*(--force([^-]|$)|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  deny "git push --force interdit (CLAUDE.md §6)."
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^;&|]*[[:space:]](origin[[:space:]]+)?(HEAD:)?main([[:space:]]|$)'; then
  deny "Push direct sur main interdit : passer par une branche et une PR."
fi
if printf '%s' "$cmd" | grep -Eq -- '--no-verify|core\.hooksPath|\.githooks/pre-push'; then
  deny "Contourner ou modifier les hooks git est interdit (CLAUDE.md §6)."
fi
if printf '%s' "$cmd" | grep -Eq 'TROUVIO_ALLOW_PUSH_MAIN'; then
  deny "La dérogation de push sur main est réservée à l'utilisateur."
fi
if has "git[[:space:]]+(log|diff|show)[^;&|]*--output" "$bare"; then
  deny "git --output écrit un fichier : rediriger la sortie autrement."
fi
if has "git[[:space:]]+add([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(--force|-[A-Za-z]*f[A-Za-z]*)([[:space:]]|$)" "$bare"; then
  deny "git add -f ajouterait un fichier ignoré (les .env le sont)."
fi
if has "git[[:space:]]+stash([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(--all|-[A-Za-z]*a[A-Za-z]*)([[:space:]]|$)" "$bare"; then
  deny "git stash -a emporterait les fichiers ignorés (les .env)."
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f|checkout[[:space:]]+--[[:space:]]+\.|restore[[:space:]]+\.)'; then
  ask "Commande git qui détruit des modifications locales : confirmation requise."
fi

# Suppressions larges.
if printf '%s' "$cmd" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r[[:space:]]+-f|-f[[:space:]]+-r)[[:space:]]+(/|~|\$HOME|\.|\*|\.\.)([[:space:]/]|$)'; then
  deny "Suppression récursive large interdite."
fi

# Exécution de scripts distants.
if printf '%s' "$cmd" | grep -Eq '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z)?sh'; then
  deny "Exécuter un script téléchargé est interdit."
fi

# Base de données : pas de synchronisation directe du schéma, migrations uniquement.
if printf '%s' "$cmd" | grep -Eq 'drizzle-kit[[:space:]]+push|db:push'; then
  deny "drizzle-kit push contourne les migrations versionnées : utiliser pnpm db:generate puis db:migrate."
fi
if printf '%s' "$cmd" | grep -Eqi '(DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)|TRUNCATE[[:space:]])'; then
  ask "Commande SQL destructive : confirmation et plan de retour arrière requis."
fi

# Magic UI (ADR 0007) : composants interdits, installation dans src/components/magicui uniquement.
if printf '%s' "$cmd" | grep -Eq 'shadcn(@[^[:space:]]+)?[[:space:]]+add[^;&|]*@magicui/'; then
  if printf '%s' "$cmd" | grep -Eq '@magicui/(globe|particles|meteors|confetti|cool-mode|aurora-text|rainbow-button|warp-background)([[:space:]]|$)'; then
    deny "Composant Magic UI interdit par l'ADR 0007 (performance, accessibilité, charte)."
  fi
  if ! printf '%s' "$cmd" | grep -Eq -- '(--path|-p)[[:space:]=]+src/components/magicui([[:space:]]|$)'; then
    deny "Installer Magic UI avec --path src/components/magicui (ADR 0007)."
  fi
fi

# Gestionnaire de paquets : pnpm uniquement.
if printf '%s' "$cmd" | grep -Eq '(^|[;&|][[:space:]]*)(npm[[:space:]]+(i|install|ci|add)|yarn([[:space:]]|$)|bun[[:space:]]+(add|install|i))'; then
  deny "Le projet utilise pnpm uniquement (CLAUDE.md §2)."
fi

# --- Confirmation humaine : exécution par fichier, copie du dépôt entier, garde-fous ---
if has "${S}find[[:space:]][^;&|]*(-exec|-execdir|-ok|-okdir|-delete)([[:space:]]|$)" "$bare"; then
  ask "find -exec/-delete exécute ou supprime sur chaque fichier trouvé : confirmation requise."
fi
if has "${S}xargs([[:space:]]|$)" "$bare"; then
  ask "xargs exécute une commande sur une liste de fichiers : confirmation requise."
fi
if has "${S}(tar|zip|rsync|ditto)([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(\.|\./|\\\$PWD|~|/)([[:space:];&|]|$)" "$bare" \
  || has "${S}cp[[:space:]]+(-[A-Za-z]*[rRa][A-Za-z]*[[:space:]]+)+(\.|\./|~|/)([[:space:]]|$)" "$bare"; then
  ask "Copie ou archive du dépôt entier (les .env compris) : confirmation requise."
fi
if has "${S}g?sed[[:space:]][^;&|]*(-i|--in-place)[^;&|]*(\.claude/|\.githooks/|\.github/workflows/)" "$bare"; then
  ask "Modification d'un garde-fou par sed -i : confirmation humaine requise."
fi

exit 0
