#!/usr/bin/env bash
# PreToolUse(Bash) : bloque les commandes dangereuses ou contraires à CLAUDE.md §6.
# Filet contre les formes plausibles, pas une frontière : le code lancé par un outil autorisé
# (pnpm test, dev, build) peut toujours lire les secrets ; la frontière sera le bac à sable (P0-08).
source "$(dirname "$0")/lib.sh"
require_jq
cmd="$(jq -r '.tool_input.command // ""')"

# Deux lectures de la commande, sans les corps de heredoc (texte littéral, jamais exécuté) :
# - « globs » : guillemets retirés, métacaractères de joker neutralisés entre guillemets ou après
#   un antislash (le shell ne les y développe pas) ; « ".e"* » reste donc un joker ;
# - « bare » : chaque chaîne entre guillemets remplacée par Q, pour lire les options sans les motifs.
normalize() { # <globs|bare>
  # Suivi des guillemets comme le shell : antislash, chaînes '…' et "…", et $( … ) qui ouvre un
  # nouveau contexte (même entre guillemets doubles) jusqu'à sa parenthèse fermante.
  printf '%s\n' "$cmd" | awk -v mode="$1" -v sq="'" '
    BEGIN { q = ""; d = 0; hd = ""; hdre = "<<-?[ \t]*[\"" sq "]?[A-Za-z_][A-Za-z0-9_]*" }
    {
      line = $0
      if (hd != "") { t = line; if (strip) sub(/^\t+/, "", t); if (t == hd) hd = ""; next }
      out = ""; n = length(line)
      for (i = 1; i <= n; i++) {
        c = substr(line, i, 1)
        if (q != sq && c == "\\" && i < n) {
          i++; c = substr(line, i, 1)
          if (q != "" && mode == "bare") continue
          if (c ~ /[][*?{}]/) c = "_"
          out = out c; continue
        }
        if (q != sq && c == "$" && substr(line, i + 1, 1) == "(") { d++; st[d] = q; pc[d] = 0; q = ""; out = out "$("; i++; continue }
        if (q == "" && d > 0 && c == "(") pc[d]++
        if (q == "" && d > 0 && c == ")") { if (pc[d] > 0) pc[d]--; else { q = st[d]; d--; out = out ")"; continue } }
        if (q == "" && (c == sq || c == "\"")) { q = c; if (mode == "bare") out = out "Q"; continue }
        if (q != "" && c == q) { q = ""; continue }
        if (q != "") { if (mode == "bare") continue; if (c ~ /[][*?{}]/) c = "_" }
        out = out c
      }
      print out
      if (q == "" && match(line, hdre)) {
        d = substr(line, RSTART, RLENGTH); strip = (d ~ /^<<-/)
        sub(/^<<-?[ \t]*/, "", d); gsub(sq, "", d); gsub(/"/, "", d); hd = d
      }
    }'
}
globs="$(normalize globs)"
bare="$(normalize bare)"
has() { printf '%s' "$2" | grep -Eq -- "$1"; }             # <regex> <texte>
has_i() { printf '%s' "$2" | grep -Eqi -- "$1"; }
# Début d'une commande simple : début de ligne, séparateur, sous-shell ou espace.
S='(^|[;&|(`[:space:]])'

# --- Secrets : fichiers .env (hors .env.example) et environnement ---
cmd_no_example="$(printf '%s \n' "$cmd" | sed -E 's/\.env\.example([^A-Za-z0-9_.-])/\1/g')"
if has '(^|[^A-Za-z0-9_$.-])\.env([^A-Za-z0-9_]|$)|\.envrc' "$cmd_no_example"; then
  deny "Accès aux fichiers .env interdit (CLAUDE.md §6). Seul .env.example est manipulable."
fi
if has '(^|[[:space:]/=<>|;&(])\.[^[:space:]/]*[][*?{]' "$globs" || has '\*\([^)]*D[^)]*\)' "$globs"; then
  deny "Joker sur des fichiers cachés (il atteindrait les .env). Nommer les fichiers, ou utiliser git grep."
fi
if has_i "${S}setopt[[:space:]]+[^;&|]*glob_?dots|${S}shopt[[:space:]]+-s[[:space:]]+[^;&|]*dotglob" "$bare"; then
  deny "Inclure les fichiers cachés dans les jokers exposerait les .env."
fi
if has "(nv|[})\"']v)\.(local|development|production)([^A-Za-z0-9_]|$)|nv\.test\.local" "$cmd"; then
  deny "Nom de fichier .env reconstruit : accès interdit (CLAUDE.md §6)."
fi
if has "\\\$'[^']*\\\\(x2[eE]|0?56|u002[eE]|U0000002[eE])" "$cmd"; then
  deny "Point encodé (\$'…') dans un nom de fichier : accès interdit aux fichiers cachés."
fi
if has "${S}(e|f)?grep([[:space:]]+[^;&|[:space:]]+)*[[:space:]]+(-[A-Za-z0-9]*[rR][A-Za-z0-9]*|--recursive|--dereference-recursive|--directories(=|[[:space:]]+)recurse|-d[[:space:]]*recurse)([[:space:];&|]|$)" "$bare"; then
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
if has '(^|[;&|][[:space:]]*)(env|printenv|export -p|set|export)[[:space:]]*($|[;&|])' "$bare" \
  || has "${S}(declare|typeset|local)[[:space:]]+-[A-Za-z]*p|${S}compgen[[:space:]]+-[A-Za-z]*[ve]" "$bare"; then
  deny "Afficher l'environnement exposerait des secrets."
fi

# --- Exécution détournée par awk ou sed (commandes autorisées sans confirmation) ---
if has "${S}[gmn]?awk([[:space:]]|$)" "$bare"; then
  if has 'system[[:space:]]*\(|getline|ENVIRON|\|[[:space:]]*"|>[[:space:]]*"' "$cmd" \
    || has "${S}[gmn]?awk([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-f|--file)([[:space:]=]|$)" "$bare"; then
    deny "awk ne doit ni lancer de commande (system, getline, tube), ni lire l'environnement, ni écrire de fichier, ni charger un script."
  fi
fi
if has "${S}g?sed([[:space:]]|$)" "$bare"; then
  if has "/[gpIiMm0-9]*e[gpIiMm0-9]*[[:space:]]*(['\";}]|$)|(^|[;{}'\"[:space:]]|[0-9\$/])[eEwW][[:space:]]+[^[:space:]'\"]" "$cmd"; then
    deny "sed ne doit ni lancer de commande (e) ni écrire de fichier (w)."
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
