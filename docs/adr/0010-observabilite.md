# ADR 0010 — Observabilité : logger maison et Sentry à collecte minimale
**Statut** : accepté · **Date** : 2026-09 · Plan : `docs/plans/P0-06.md`

## Contexte
Trouvio traite des données de chercheurs d'emploi : critères, prétentions salariales, suivi de candidatures. Le dépôt et les journaux GitHub Actions sont publics (ADR 0009). Il faut des journaux exploitables et un suivi d'erreurs (ARCHITECTURE §2, « échec partiel toléré ») sans laisser fuir de données personnelles ni de secrets.

`@sentry/nextjs` 11 remplace `sendDefaultPii` par `dataCollection`. Ses valeurs par défaut sont **permissives** : utilisateur, cookies, en-têtes, corps HTTP, entrées et sorties d'IA, variables locales des frames.

## Décision
1. **Logger maison, sans dépendance** (`src/lib/logger`).
   - Il écrit une ligne JSON par événement : `time`, `level`, `msg`, `service`, `runtime`, `ctx`, `err`.
   - Il masque récursivement les données sensibles par liste de refus : sur les **clés**, et par motifs sur les **valeurs** (emails, Bearer, JWT, clés Anthropic, jetons Telegram, paramètres de query string sensibles, identifiants d'URL).
   - Il sérialise les erreurs avec leur chaîne `cause`. Le niveau se règle par `LOG_LEVEL`.
   - La sortie est bornée (éléments, clés, valeurs et erreurs par appel), et le logger ne lève jamais, même sur un contexte illisible.
   - `logger.error` signale toujours à Sentry via `@sentry/core`. Ce choix sert aussi le job (P5), qui n'utilise pas Next.
   - ESLint réserve `@sentry/*` aux points d'intégration (instrumentation, `global-error`, `lib/observability`, `lib/logger/index.ts`) : pas de contournement du masquage.
   - Règle d'usage : journaliser **ou** relancer une erreur, pas les deux.
   - pino est écarté : sa redaction se fait par chemins (ni profondeur quelconque, ni motifs dans les valeurs), il passe par des workers, et le volume est minuscule.
2. **Sentry 11, même politique sur le serveur et le navigateur** (`src/lib/observability/sentry-options.ts`).
   - `dataCollection` est posé en entier, avec une liste courte d'en-têtes autorisés. Tout le reste est coupé : utilisateur, cookies, corps, query string, IA, requêtes de base de données, files, GraphQL, variables locales.
   - Défense en profondeur : `beforeSend` et `beforeBreadcrumb` réutilisent le masquage du logger, ne gardent de la requête que la méthode, l'URL sans query string et les en-têtes autorisés, réduisent `user` à son `id` et retirent le nom de la machine. La query string est aussi retirée de `contexts.nextjs.request_path`, que `captureRequestError` remplit avec l'URL brute.
   - Ce qui échappe à `beforeSend` est coupé à la source : sessions navigateur (intégration `BrowserSession` retirée), journaux et métriques Sentry (`beforeSendLog` et `beforeSendMetric` renvoient `null`), nom de machine (`includeServerName: false`), Spotlight. Les hooks de chargement de modules du serveur, qui ne servent qu'aux traces, ne sont pas installés (`enableRuntimeChannelInjection: false`). `SENTRY_TRACES_SAMPLE_RATE`, que le SDK lirait hors `env.ts`, fait refuser le démarrage.
   - Le nettoyage côté serveur de l'organisation Sentry reste activé en plus (Data Scrubber et scrubbers par défaut exigés, adresses IP non stockées, champs sensibles globaux, Enhanced Privacy).
   - Sans DSN, aucun `init`.
3. **Ni replay, ni traces.**
   - Replay : l'écran porte des données personnelles, il faudrait un consentement et une CSP `worker-src blob:`.
   - Traces : rien à tracer avant P2, et on n'envoie aucun en-tête `sentry-trace` aux API tierces.
   - Pour les mêmes raisons, pas d'instrumentation de build ni de manifeste des routes dans le bundle client.
4. **Build sans secret.**
   - `withSentryConfig` est réglé sans upload de source maps, sans jeton et sans télémétrie.
   - Aucune source map n'est servie ; un E2E le vérifie.
   - L'upload (jeton de build en production seulement) viendra en P10-02.
5. **DSN publié au navigateur par `compiler.define`**, depuis `publicBuildEnv()` de `src/lib/env.ts`.
   - CLAUDE.md §5 reste respecté : aucune lecture d'environnement hors `env.ts`, et pas de variable `NEXT_PUBLIC_`.
   - Le DSN est public par nature : il ne permet que d'envoyer des événements.
   - La valeur est figée au build.
6. **Runtime Node uniquement.** Il n'y a pas de configuration edge ; une route edge ne serait pas surveillée.
7. **Organisation Sentry en région UE (Frankfurt).** Sentry est un sous-traitant, à citer dans la politique de confidentialité (P7). La région est imposée par `env.ts` : un DSN dont l'hôte n'est pas `o<id>.ingest.de.sentry.io` est refusé au build et au démarrage (P0-07).

## Conséquences
- \+ Aucune donnée personnelle ni aucun secret attendu dans les journaux ou chez Sentry. Chaque catégorie de collecte et chaque étape de nettoyage sont testées, avec des preuves par mutation.
- \+ Le build des PR n'exige aucun secret. Les journaux, le signalement et les options sont réutilisables par le job P5.
- − Pas de traces de performance ni de replays. Il faudra un nouvel ADR pour en ajouter.
- − Liste de refus : une donnée sensible sous une clé neutre et sans motif reconnaissable passerait. On compense avec la règle « jamais d'objet utilisateur entier dans un journal », la revue et le nettoyage côté serveur de Sentry.
- − `@sentry/core` et `@sentry/nextjs` doivent rester à la même version exacte. Un groupe Dependabot `sentry` et un test y veillent. Relire le changelog à chaque mise à jour : une nouvelle catégorie de `dataCollection` prendrait sa valeur par défaut.
- − Le quota gratuit est de 5 000 erreurs par mois, et le plan gratuit n'offre pas de limite de débit par clé. La Spike Protection est active, `global-error` ne signale pas une seconde fois une erreur serveur, et le job fera une capture par source et par exécution (P5-03).
- − Next écrit lui-même sur stderr les erreurs serveur brutes, hors logger : rétention courte des journaux du conteneur (P10-02).

## Alternatives écartées
- **pino avec redaction par chemins** : ne masque ni à une profondeur quelconque ni dans les valeurs.
- **`NEXT_PUBLIC_SENTRY_DSN`** : aurait demandé d'amender CLAUDE.md §5 et d'exempter un fichier du lint et du hook.
- **Sentry 10.75** : `sendDefaultPii` y est à `false` par défaut, mais `@sentry/cli` exige un script d'installation, et la branche passe en maintenance.
- **Route de débogage commitée** pour la preuve d'acceptation : surface d'attaque et code mort en production. Les pages de déclenchement restent temporaires et ne sont jamais commitées.
