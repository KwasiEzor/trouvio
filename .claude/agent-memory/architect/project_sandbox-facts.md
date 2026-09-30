---
name: sandbox-facts
description: Faits verifies (2026-09-30, plan P0-08) sur le bac a sable Bash de Claude Code (Seatbelt, sandbox-runtime), versions installees, lecture des fichiers dotenv par Next/Vite sous refus, hooks hors bac a sable
metadata:
  type: project
---

- Versions au 2026-09-30 : la session de l'app de bureau tourne sur Claude Code 2.1.284 ; la CLI du terminal (~/.local/bin/claude) est en 2.1.42 (fevrier 2026, tres ancienne). Toute cle de bac a sable doit etre mesuree sur CHAQUE surface ; exiger >= 2.1.236 (correctif macOS des jokers denyRead).
- Doc (settings-reference) : autoAllowBashIfSandboxed vaut TRUE par defaut (activer le bac a sable sans le poser a false fait passer toute commande confinee sans demande, sauf deny et ask cibles). strictAllowlist, tlsTerminate, credentials mask, allowAppleEvents, filesystem.disabled : ignores depuis les reglages du depot (utilisateur/geres seulement). Les regles WebFetch(domain:...) alimentent la liste reseau du bac a sable ; Read deny -> denyRead ; Edit allow/deny -> allowWrite/denyWrite.
- sandbox-runtime (profil macOS) : deny file-read* inclut les metadonnees (stat -> EPERM) ; mv/rename d'un fichier refuse en lecture bloque (file-write-unlink) ; allowRead d'un fichier exact dans un joker denyRead = exception conservee ; pas de regle pour les liens physiques (a mesurer) ; allowLocalBinding ouvre aussi la sortie vers TOUT port localhost ; variable SANDBOX_RUNTIME=1 et proxy HTTP(S)_PROXY poses ; SecurityServer (trousseau) autorise, trustd.agent non (gh/Go echoue en TLS sauf enableWeakerNetworkIsolation) ; .git/hooks, .git/config et .claude/* proteges en ecriture (git push -u / git config echouent).
- @next/env 16.3.6 : stat/lecture en EPERM -> console.error "Failed to load env from ..." puis continue (build non casse). Vite 8 loadEnv : tryStatSync avale l'erreur de stat, mais un readFileSync en echec apres un stat reussi ferait planter Vitest.
- src/lib/env.test.ts et src/test/litteraux-secrets.test.ts LISENT le fichier d'exemple : tout refus sur le motif dotenv doit l'exempter.
- Les hooks (format.sh -> prettier.config, stop-verify.sh -> next typegen + vitest) s'executent HORS bac a sable et executent du code modifiable par Claude : trou de la frontiere. /usr/bin/sandbox-exec et sandbox_check (ctypes, preuve noyau) disponibles sur macOS 26.6.
- ~/Library/pnpm est dans le PATH (PNPM_HOME) : n'autoriser en ecriture que ~/Library/pnpm/store (+ ~/Library/Caches/pnpm). Jeton gh dans le trousseau (pas dans hosts.yml). Remote git en HTTPS + osxkeychain.

**Why:** verifie en planifiant P0-08 (docs code.claude.com, source anthropic-experimental/sandbox-runtime, node_modules).
**How to apply:** tout plan qui touche settings.json, hooks, dev/E2E, secrets de dev (P1-01 base locale, P3 eval avec cle API via mask) part de ces faits. Voir [[tooling-gotchas]], [[env-and-runtime-facts]].
