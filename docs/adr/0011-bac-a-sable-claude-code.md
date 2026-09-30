# ADR 0011 — Bac à sable Bash de Claude Code : frontière des secrets locaux
**Statut** : accepté · **Date** : 2026-09 · Plan : `docs/plans/P0-08.md`

## Contexte
Le poste de développement garde de vrais secrets dans `.env.local`, et d'autres dans le dossier personnel (autres projets, configurations de CLI, trousseau). Claude Code y lance des commandes Bash. Les hooks de P0-07 sont un **filet** : ils ne lisent que le texte de la commande. Le code lancé par un outil autorisé (`pnpm test`, `dev`, `build`, un test, une config) pouvait donc lire `.env.local`. Un sous-agent a d'ailleurs été signalé pour « Credential Exploration » le 2026-09-29.

Claude Code propose un bac à sable pour Bash : Seatbelt sur macOS. Il confine chaque commande **et ses descendants** au niveau du système. Les hooks de Claude, eux, tournent en dehors, comme tout ce que l'utilisateur lance dans son terminal.

## Décision
1. **Bac à sable actif dans les réglages du projet** (`.claude/settings.json`).
   - `enabled` et `failIfUnavailable` : Claude Code refuse de démarrer plutôt que de tourner sans frontière.
   - `allowUnsandboxedCommands: false` : aucune nouvelle tentative hors bac à sable ; `dangerouslyDisableSandbox` est ignoré.
   - `autoAllowBashIfSandboxed: false` : les listes `allow` et `ask` gardent leur sens.
   - `excludedCommands` vide.
2. **Lecture : tout le dossier personnel est refusé**, puis rouvert au plus juste, chaque entrée justifiée par une mesure :
   - le projet ;
   - le runtime Node (Herd/nvm) ;
   - `~/.gitconfig`, `~/.config/git`, `~/.config/gh` ;
   - le jeton de Vitest (`~/Library/Application Support/vitest`) ;
   - les fichiers du shell de Claude Code.

   Les `.env*` du projet restent refusés à tout niveau, sauf `.env.example`. `~/.ssh`, `~/.aws`, `~/.docker` et `~/.netrc` sont aussi refusés explicitement, en défense en profondeur.
3. **Écriture : le projet et le dossier temporaire seulement**, sauf :
   - les `.env` (les motifs sont insensibles à la casse, mesuré) ;
   - `.githooks` ;
   - `node_modules` (paquets, `.bin`, `.pnpm`, `.modules.yaml`) : ce que l'utilisateur exécute ensuite dans son terminal n'est pas modifiable par Claude ;
   - les protections intégrées : réglages, `hooks`, `skills`, `agents` et `commands` de `.claude`, `.git/hooks`, `.git/config`.

   Pas d'écriture du store ni du cache pnpm, partagés avec tous les projets du poste : `pnpm install` et `pnpm add` se lancent dans le terminal de l'utilisateur.
4. **Réseau.**
   - Domaines permis : `registry.npmjs.org`, `github.com`, `api.github.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, plus les domaines `WebFetch` autorisés (fusion automatique). Tout autre domaine déclenche une demande.
   - `allowLocalBinding` : `pnpm dev`.
   - `enableWeakerNetworkIsolation` : `gh` (Go) échoue sinon en TLS (`x509: OSStatus -26276`).
5. **Variables.** `NEXT_TELEMETRY_DISABLED=1`. `WATCHPACK_POLLING=true` : FSEvents est refusé, et sans scrutation `next dev` échoue en `EMFILE` et redémarre en boucle. Il reste **sans rechargement à chaud** : Claude le relance après une modification.
6. **Aucun secret dans le bac à sable.** `pnpm test`, `verify`, `build` et `dev` lancés par Claude tournent **sans `.env.local`**, comme la CI, avec les valeurs par défaut non secrètes de `src/lib/env.ts`. Next journalise `Failed to load env … EPERM` : c'est attendu.
   - Base de dev non secrète : décidée en P1-01.
   - Masquage des clés d'API par `sandbox.credentials` (`mask`, réglage utilisateur) : étudié en P3.
7. **Ce qui tourne hors bac à sable est lancé par l'utilisateur, dans son terminal**, jamais par `!` : ce mode s'exécute hors bac à sable et renvoie la sortie dans la conversation. Ce sont :
   - `pnpm test:e2e`, car Seatbelt refuse à Chromium l'enregistrement Mach de ses processus, et en processus unique il plante à la navigation ; la CI rejoue les E2E sur chaque PR ;
   - un serveur avec de vrais secrets ;
   - `pnpm install` et `pnpm add`.

   Règles :
   - relire `git diff` et `git status` avant de lancer ;
   - supprimer `.next`, que Claude peut écrire ;
   - **aucune session Claude ne modifie le code pendant qu'un processus avec de vrais secrets tourne hors bac à sable** (`next dev` recharge chaque modification).
8. **Hooks sans code du dépôt.** Les hooks n'exécutent que bash, jq et git. Le hook Stop compare l'empreinte des fichiers TypeScript modifiés à celle que note `scripts/verifie-modifs.sh`. Claude lance ce script dans son bac à sable : il formate, vérifie les types et lance les tests liés. Un test de `scripts/test-hooks.sh`, en CI, vérifie qu'aucun hook déclaré n'exécute d'outil du dépôt.
   - Un profil `sandbox-exec` maison (`confine`) a été écarté : parti de « tout permis sauf… », il laissait des sorties (Launch Services, Apple Events, `launchctl`, sockets Unix, `/private/tmp`).
9. **Le filet reste.** `guard-bash` refuse plus tôt, avec un message clair, et couvre aussi Read, Grep et Edit. Il refuse aussi d'extraire du trousseau : `gh auth token`, `gh auth status --show-token`, `security find-*-password`, `security dump-keychain`, `security -i`, `git credential fill` et `GIT_TRACE_REDACT=0`. `guard-files` demande confirmation pour `.mcp.json`, `.vscode/` et `.git/`.
10. **Preuve.** `scripts/test-sandbox.sh` : 36 sondes.
    - Méthode : un canari `.env.canary` (non secret, ignoré par git) et un témoin lisible ; chaque sonde de lecture doit lire le témoin et échouer sur le canari. Sa sortie n'est jamais affichée ; `.env.local` n'est sondé que par code de retour.
    - Les sondes couvrent aussi la lecture de `~`, la création d'un `.env` en majuscules, l'écriture du store, de `node_modules` et des garde-fous, et la connexion directe.

## Conséquences
- \+ Frontière au niveau du système : lire `.env.local` depuis Bash échoue, directement ou par un sous-processus (`node`, `python3`, liens symboliques ou physiques, `cp`, `mv`, `tar`, `git`, `sqlite3`, noms en majuscules). C'est vrai aussi pour les sous-agents. Les autres secrets du dossier personnel sont illisibles aussi.
- \+ Parité avec la CI : ni test, ni `verify`, ni build n'exigent de secret. Surcoût mesuré nul (test 4 à 5 s, `verify` 37 s).
- \+ Les hooks n'exécutent plus de code modifiable par Claude.
- − Friction : les E2E, le serveur avec de vrais secrets et les installations passent par l'utilisateur. Pas de rechargement à chaud pour Claude.
- − **Trousseau** joignable depuis le bac à sable (git et `gh` en ont besoin) : le code d'un test peut en extraire le jeton `gh` et l'envoyer vers `api.github.com`. Le filet ne voit que le texte des commandes. Prérequis : jetons `gh` et git **à grain fin, limités au dépôt**.
- − Jeton de Vitest lisible : il protège l'interface web de Vitest, que le projet n'utilise pas. Sur un poste neuf, un premier `pnpm test` dans le terminal le crée.
- − `allowLocalBinding` ouvre la sortie vers tout port localhost : ne pas laisser de port de débogage ouvert.
- − Deux sorties étroites, acceptées parce que les secrets restent illisibles : les domaines `WebFetch` fusionnés (façade de domaine possible, le proxy ne lit pas le TLS) et `trustd`, ouvert par `enableWeakerNetworkIsolation`.
- − `.git/config` est protégé : `push -u` et le script `prepare` ne peuvent pas l'écrire. L'amont se pose une fois, par l'utilisateur.
- − pnpm avertit à chaque commande qu'il ne peut pas lire `~/Library/Preferences/pnpm/rc` : bruit attendu.
- − `failIfUnavailable` : si le bac à sable ne démarre pas, Claude Code non plus. Sortie de secours pour une session, par l'utilisateur seulement : `claude --settings '{"sandbox":{"enabled":false}}'`.

## Alternatives écartées
- **`excludedCommands`** (`pnpm dev`, `gh`, Playwright) : le code modifié par Claude tournerait hors bac à sable, et sans demande (`Bash(pnpm dev)` et `Bash(pnpm test*)` sont en `allow`).
- **Hooks confinés par un profil `sandbox-exec` maison** : une liste de refus sur « tout permis » ne se prouve pas complète.
- **`sandbox-runtime` pour les hooks** : nouvelle dépendance et réglages en double, pour un gain nul une fois que les hooks n'exécutent plus de code.
- **Liste de refus élargie dans `~`** plutôt qu'un refus total : ce qui n'est pas listé reste lisible.
- **Secrets dans l'environnement du processus Claude** : hérités par les commandes confinées.
- **`allowMachLookup`** (booléen, ouvre tous les services XPC) : pas de preuve qu'il suffise à Chromium.
- **Chromium `--single-process`** : mode non pris en charge, plante à la navigation.
- **`autoAllowBashIfSandboxed: true`** : `gh gist create`, `gh api` ou `curl` partiraient sans demande.
