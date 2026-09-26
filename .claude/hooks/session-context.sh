#!/usr/bin/env bash
# SessionStart : injecte l'état de travail (branche, tâche, plan, prochaine tâche) pour démarrer sans relire tout le dépôt.
source "$(dirname "$0")/lib.sh"
cd "$PROJECT_DIR" || exit 0
source_type="$(command -v jq >/dev/null 2>&1 && jq -r '.source // .session_start_type // "startup"' 2>/dev/null || echo startup)"

lines=()
if git rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git branch --show-current 2>/dev/null)"
  dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  lines+=("Branche : ${branch:-détachée} · fichiers modifiés non commités : $dirty")
  task_id="$(grep -oE 'P[0-9]+-[0-9]+[a-z]?' <<<"$branch" | head -1)"
  if [[ -n "$task_id" ]]; then
    plan="docs/plans/$task_id.md"
    if [[ -f "$plan" ]]; then
      status="$(grep -m1 -iE '^\**Statut' "$plan" | sed 's/[*]//g')"
      lines+=("Tâche en cours : $task_id — plan $plan (${status:-statut inconnu}). Relire le plan avant de continuer.")
    else
      lines+=("Tâche en cours : $task_id — AUCUN plan dans docs/plans/ : lancer /next-task $task_id.")
    fi
  fi
else
  lines+=("Pas de dépôt git.")
fi
next="$(grep -m1 -E '^- \[ \] \*\*P[0-9]+-[0-9a-z]+\*\*' docs/ROADMAP.md 2>/dev/null | sed -E 's/^- \[ \] //; s/\*\*//g' | cut -c1-160)"
[[ -n "$next" ]] && lines+=("Prochaine tâche non cochée : $next")
command -v jq >/dev/null 2>&1 || lines+=("ATTENTION : jq absent, les hooks de sécurité bloqueront tout.")
[[ "$source_type" == "compact" ]] && lines+=("Contexte compacté : relire docs/plans/<ID>.md et CLAUDE.md §9 avant de reprendre.")

ctx="$(printf '%s\n' "${lines[@]}")"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg c "[Trouvio] $ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
else
  printf '[Trouvio] %s\n' "$ctx"
fi
exit 0
