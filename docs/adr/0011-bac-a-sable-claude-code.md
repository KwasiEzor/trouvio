# ADR 0011 — Bac à sable Bash de Claude Code : frontière des secrets locaux
**Statut** : accepté · **Date** : 2026-09 · Plan : `docs/plans/P0-08.md`

## Contexte
Le poste de développement garde de vrais secrets dans `.env.local`. Claude Code y lance des commandes Bash. Les hooks de P0-07 sont un **filet** : ils ne lisent que le texte de la commande. Le code lancé par un outil autorisé (`pnpm test`, `dev`, `build`, un test, une config) pouvait donc lire `.env.local`. Un sous-agent a d'ailleurs été signalé pour « Credential Exploration » le 2026-09-29.

Claude Code propose un bac à sable pour Bash : Seatbelt sur macOS. Il confine chaque commande **et ses descendants** au niveau du système. Les hooks de Claude tournent en dehors, et deux d'entre eux exécutent du code du dépôt (Prettier, `next typegen`, Vitest).

## Décision
1. **Bac à sable actif dans les réglages du projet** (`.claude/settings.json`).
   - `enabled` et `failIfUnavailable` : Claude Code refuse de démarrer plutôt que de tourner sans frontière.
   - `allowUnsandboxedCommands: false` : aucune nouvelle tentative hors bac à sable ; `dangerouslyDisableSandbox` est ignoré.
   - `autoAllowBashIfSandboxed: false` : les listes `allow` et `ask` gardent leur sens (`git push`, `pnpm install`, `gh pr create` restent demandés).
   - `excludedCommands` vide.
2. **Fichiers.**
   - Lecture refusée : `./.[eE][nN][vV]*` sauf `./.env.example` ; `~/.ssh`, `~/.aws`, `~/.docker`, `~/.netrc`.
   - Écriture refusée : les `.env` et `.githooks`. Un hook git piégé s'exécuterait sinon hors bac à sable au prochain push de l'utilisateur.
   - Écriture ajoutée : le store et le cache pnpm seulement. Pas `~/Library/pnpm`, qui est dans le `PATH`.
   - Protections intégrées, non levables : réglages, `hooks`, `skills`, `agents` et `commands` de `.claude`, `.git/hooks`, `.git/config`.
3. **Réseau.**
   - Domaines permis : `registry.npmjs.org`, `github.com`, `api.github.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, plus les domaines `WebFetch` déjà autorisés (fusion automatique). Tout autre domaine déclenche une demande.
   - `allowLocalBinding` : `pnpm dev` et le serveur des E2E.
   - `enableWeakerNetworkIsolation` : `gh` (Go) échoue sinon en TLS (`x509: OSStatus -26276`).
4. **Variables.** `NEXT_TELEMETRY_DISABLED=1`. `npm_config_store_dir=~/Library/pnpm/store` : sans lui, pnpm teste un lien physique dans `~`, qui est refusé, change de store et exige une purge de `node_modules`.
5. **Aucun secret dans le bac à sable.**
   - `pnpm test`, `verify`, `build` et `dev` lancés par Claude tournent **sans `.env.local`**, comme la CI, avec les valeurs par défaut non secrètes de `src/lib/env.ts`. Next journalise `Failed to load env … EPERM` : c'est attendu.
   - Un serveur avec de vrais secrets est lancé par l'utilisateur **dans son terminal**. Pas par `!` : ce mode s'exécute hors bac à sable et renvoie la sortie dans la conversation. Claude interroge ce serveur sur `localhost`.
   - Base de dev non secrète : décidée en P1-01. Masquage des clés d'API par `sandbox.credentials` (`mask`, réglage utilisateur) : étudié en P3.
6. **E2E hors bac à sable.** Seatbelt refuse à Chromium l'enregistrement Mach de ses processus ; en processus unique, il plante à la navigation. `pnpm test:e2e` est lancé par l'utilisateur dans son terminal, et la CI le rejoue sur chaque PR.
7. **Hooks confinés.** `confine` (`.claude/hooks/lib.sh`) exécute Prettier (`format.sh`), `next typegen` et Vitest (`stop-verify.sh`) sous `sandbox-exec`. Le profil :
   - refuse la lecture des `.env` (hors `.env.example`) et des secrets du dossier personnel ;
   - limite l'écriture au projet et aux dossiers temporaires, jamais dans `.claude`, `.githooks`, `.git/hooks`, `.git/config` ;
   - limite le réseau à localhost.

   Hors macOS (CI), la commande s'exécute telle quelle. Sur macOS sans `sandbox-exec`, elle ne s'exécute pas : la vérification est perdue, le secret reste fermé.
8. **Le filet reste.** `guard-bash` refuse plus tôt, avec un message clair, et couvre aussi Read, Grep et Edit. Il refuse en plus d'extraire du trousseau (`gh auth token`, `gh auth status --show-token`, `security find-*-password`, `security dump-keychain`, `git credential fill`) : le trousseau reste joignable depuis le bac à sable, car git et `gh` s'en servent.
9. **Preuve.** `scripts/test-sandbox.sh` : un canari `.env.canary` (non secret, ignoré par git) et un témoin lisible. Chaque sonde doit lire le témoin et échouer sur le canari. Sa sortie n'est jamais affichée. `.env.local` n'est sondé que par code de retour. Mode `bash` lancé par Claude, mode `hooks` lancé par l'utilisateur.

## Conséquences
- \+ Frontière au niveau du système : lire `.env.local` depuis Bash échoue, directement ou par un sous-processus (`node`, `python3`, liens symboliques ou physiques, `cp`, `mv`, `tar`, `git`, `sqlite3`, noms en majuscules). C'est vrai aussi pour les sous-agents.
- \+ Parité avec la CI : ni test, ni `verify`, ni build n'exigent de secret. Surcoût mesuré nul (test 4 s, build 12 s, dedans comme dehors).
- \+ Les hooks ne sont plus un trou dans la frontière.
- − Friction : les E2E et le serveur avec de vrais secrets passent par l'utilisateur. À partir de P1-01, une commande qui a besoin de la base utilise des valeurs locales non secrètes.
- − Le code que l'utilisateur exécute ensuite hors bac à sable (`pnpm test:e2e`, `pnpm dev`, scripts `package.json`) n'est pas protégé : relire `git diff` avant.
- − Le trousseau reste joignable (jeton `gh`) : le filet seul le couvre. Recommandation : un jeton `gh` à grain fin limité à ce dépôt.
- − `allowLocalBinding` ouvre aussi la sortie vers tout port localhost : ne pas laisser de port de débogage ouvert.
- − Les domaines `WebFetch` fusionnés rendent possible une façade de domaine (le proxy ne lit pas le TLS). `enableWeakerNetworkIsolation` ouvre `trustd`. Deux sorties étroites, acceptées : les `.env` restent illisibles.
- − `.git/config` est protégé : `push -u` et le script `prepare` ne peuvent pas l'écrire. L'amont se pose une fois, par l'utilisateur. Une montée de `packageManager` et `playwright install` téléchargent hors du dépôt : c'est à l'utilisateur de les lancer.
- − `failIfUnavailable` : si le bac à sable ne démarre pas, Claude Code non plus. Sortie de secours pour une session, par l'utilisateur seulement : `claude --settings '{"sandbox":{"enabled":false}}'`.
- − `sandbox-exec` est déprécié par Apple. S'il disparaît, `confine` refuse d'exécuter : un nouvel ADR sera nécessaire.

## Alternatives écartées
- **`excludedCommands`** (`pnpm dev`, `gh`, Playwright) : le code modifié par Claude tournerait hors bac à sable, et sans demande (`Bash(pnpm dev)` et `Bash(pnpm test*)` sont en `allow`).
- **Secrets dans l'environnement du processus Claude** : hérités par les commandes confinées ; `node -p process.env` suffirait.
- **`allowMachLookup`** : un booléen qui ouvre tous les services XPC à toute commande confinée, sans preuve qu'il suffise à Chromium.
- **Chromium `--single-process`** : mode non pris en charge, plante à la navigation.
- **`autoAllowBashIfSandboxed: true`** : `gh gist create`, `gh api` ou `curl` partiraient sans demande.
- **Hooks seuls (P0-07)** : ils voient le texte de la commande, pas ce que fait le code exécuté.
