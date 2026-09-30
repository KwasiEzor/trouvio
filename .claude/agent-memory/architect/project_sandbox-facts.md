---
name: sandbox-facts
description: Faits mesures (2026-09-30, P0-08) sur le bac a sable Bash de Claude Code (Seatbelt, sandbox-runtime) : versions, reglages retenus, ce qui casse dedans, hooks sans code
metadata:
  type: project
---

- Versions au 2026-09-30 : app de bureau 2.1.284, CLI du terminal 2.1.285 (native ; l'ancienne 2.1.44 npm sous Herd a ete desinstallee). Exiger >= 2.1.236 sur chaque surface.
- Les listes filesystem et enableWeakerNetworkIsolation s'appliquent A CHAUD a la session en cours (mesure), meme sandbox.enabled. Une edition peut mettre ~1 s a prendre effet : remesurer avant de conclure.
- Doc : autoAllowBashIfSandboxed vaut TRUE par defaut ; allowMachLookup est un BOOLEEN (pas de liste de noms) ; filesystem.disabled interdit depuis le projet. Read deny -> denyRead ; WebFetch(domain:...) -> liste reseau.
- Seatbelt : stat en EPERM sur un fichier refuse ; unlink/mv d'un fichier refuse en lecture bloque (un fichier cree sous un motif denyRead ne peut plus etre supprime depuis le bac a sable) ; liens physiques refuses ; chemin canonique compare (majuscules tapees couvertes) ; motifs denyWrite insensibles a la casse ; dans les motifs, `*` couvre aussi les entrees cachees.
- Reglages retenus : denyRead ~/ + allowRead mesure (projet, runtime Node Herd/nvm, ~/.gitconfig, ~/.config/git, ~/.config/gh, ~/Library/Application Support/vitest pour le jeton de Vitest 5, ~/.claude/shell-snapshots et session-env) ; node_modules/* .bin .pnpm .modules.yaml en denyWrite ; pas d'ecriture du store pnpm (installs par l'utilisateur) ; WATCHPACK_POLLING=true.
- Casse dans le bac a sable : Chromium/Playwright (enregistrement Mach refuse ; --single-process plante) -> E2E dans le terminal de l'utilisateur ; FSEvents refuse -> next dev sans rechargement a chaud ; gh sans enableWeakerNetworkIsolation (x509) ; sandbox-exec imbrique interdit ; pkill/ps interdits (arreter un serveur par TaskStop, jamais le detacher) ; mktemp sans modele vise /var/folders (refuse).
- Hooks : ils tournent hors bac a sable, donc n'executent AUCUN code du depot (bash, jq, git) ; stop-verify compare une empreinte notee par scripts/verifie-modifs.sh. Un profil sandbox-exec maison (confine, allow default) a ete ecarte : sorties Launch Services, Apple Events, launchctl, sockets Unix, /private/tmp.
- Trousseau (SecurityServer) joignable depuis le bac a sable : jetons gh/git a grain fin requis.

**Why:** mesure pendant l'implementation de P0-08 (ADR 0011), apres revues code et securite.
**How to apply:** tout plan qui touche settings.json, hooks, dev/E2E, secrets de dev (P1-01 base locale, P3 cle API via mask) part de ces faits. Voir [[tooling-gotchas]], [[env-and-runtime-facts]].
