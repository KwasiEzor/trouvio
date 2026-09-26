#!/usr/bin/env bash
# PreToolUse(Bash) : bloque les commandes dangereuses ou contraires à CLAUDE.md §6.
source "$(dirname "$0")/lib.sh"
require_jq
cmd="$(jq -r '.tool_input.command // ""')"

# Secrets : lecture des .env (hors .env.example) ou vidage de l'environnement.
cmd_no_example="${cmd//.env.example/}"
if printf '%s' "$cmd_no_example" | grep -Eq '(^|[[:space:]/"'\''=<:])\.env([.][A-Za-z0-9_-]+)?([[:space:]"'\'';|&)]|$)'; then
  deny "Accès aux fichiers .env interdit (CLAUDE.md §6). Seul .env.example est manipulable."
fi
if printf '%s' "$cmd" | grep -Eq '(^|[;&|][[:space:]]*)(env|printenv|export -p)[[:space:]]*($|[;&|])'; then
  deny "Afficher l'environnement exposerait des secrets."
fi

# Git destructif.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^;&|]*(--force([^-]|$)|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  deny "git push --force interdit (CLAUDE.md §6)."
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^;&|]*[[:space:]](origin[[:space:]]+)?(HEAD:)?main([[:space:]]|$)'; then
  deny "Push direct sur main interdit : passer par une branche et une PR."
fi
if printf '%s' "$cmd" | grep -Eq -- '--no-verify|-c[[:space:]]+core\.hooksPath'; then
  deny "Contourner les hooks git est interdit (CLAUDE.md §6)."
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

exit 0
