# Stratégie de tests — Trouvio

## Pyramide
| Niveau | Outil | Cible | Exemples |
|---|---|---|---|
| Unitaire | Vitest | Logique pure `features/*/core` | normalisation, dédoublonnage, sélection du digest, calcul de coût |
| Contrat | Vitest + fixtures | Adapters de sources | réponse réelle anonymisée → `NormalizedOffer` attendu |
| Intégration | Vitest + MSW + Postgres de test | Routes API, Server Actions, job | `runDailyJob()` de bout en bout avec sources et LLM simulés |
| Sécurité | Vitest | Autorisations | IDOR, accès admin, job concurrent bloqué par le verrou, cron sans secret (P10-05), rate limit |
| E2E | Playwright | Parcours critiques | inscription → config → fil → suivi |
| Évaluation IA | `pnpm eval:scoring` | Qualité du prompt | accord ≥ 80 % sur le jeu de référence |

## Règles
- Aucun appel réseau réel dans `pnpm test` : sources et Anthropic sont simulés (MSW). Les appels réels sont réservés à `pnpm eval:scoring` et aux tests manuels.
- Base de données de test isolée : Postgres Docker local (`pnpm db:local:up`) et service Postgres en CI, même image (ADR 0012). Chaque fichier de test a sa propre base, clonée d'un modèle migré, puis supprimée.
- Couverture minimale : **80 %** sur `features/*/core` et `lib/`, suivie en CI.
- Chaque bug corrigé ajoute un test de non-régression.
- Les tests E2E utilisent des comptes créés par seed, jamais de vraies données.

## Évaluation du scoring (IA)
- Jeu de référence `evals/scoring-golden.jsonl` : chaque ligne = une offre + une référence de profil (`evals/profiles/<nom>.json`, critères de recherche uniquement) + la **bande attendue** (`high` ≥ 70, `medium` 50–69, `low` < 50, alignées sur le barème du prompt), étiquetée par un humain.
- Métriques : taux d'accord de bande, nombre d'inversions (`high` prédit `low` ou l'inverse → doit être 0), coût moyen par offre, taux de sorties invalides.
- Déclenchement : à chaque modification de `prompts/` ou `features/scoring/` (filtre de chemins en CI), résultat collé dans la PR.
- Le jeu s'enrichit pendant l'auto-test : chaque désaccord entre Kwasi et l'IA devient une nouvelle ligne.

## Commandes et conventions (P0-03)
| Commande | Rôle |
|---|---|
| `pnpm test` | Vitest, trois projets : `node` (`*.test.ts`), `dom` (`*.test.tsx`, jsdom + Testing Library) et `db` (`*.db.test.ts`, vrai Postgres) |
| `pnpm test:coverage` | idem + couverture v8 et seuils (inclus dans `pnpm verify`) |
| `pnpm test:e2e` | Playwright (chromium) sur un **build de production** (`next build` + `next start` sur le port 3100, `APP_URL` fourni par la config, aucun fichier `.env`) ; contrôle d'accessibilité axe (WCAG A/AA) |
| `pnpm exec vitest run --project dom` | un seul projet |
| `pnpm db:check` | dérive entre `db/schema.ts` et `db/migrations` (inclus dans `pnpm verify`) |

- **Tests colocalisés**, `globals: false` (imports explicites depuis `vitest`).
- **Base de données** (P1-01, ADR 0012) :
  - projet `db` : `src/test/db/global-setup.ts` migre une base modèle, puis chaque fichier ouvre sa base avec `openTestDatabase({ migrated })`, et `resetData` la vide entre deux tests ;
  - `TEST_DATABASE_URL` vaut par défaut `127.0.0.1:54329` et refuse tout hôte hors boucle locale : aucun test ne vise Neon ;
  - base injoignable : erreur « lance `pnpm db:local:up` », jamais de test sauté. `pnpm test` et `pnpm verify` exigent donc Docker lancé (Docker Desktop sur le poste, service en CI) ;
  - invariants du schéma vérifiés sans base (`src/lib/db/schema.test.ts`) : cascade RGPD, index sur `user_id` et sur chaque clé étrangère, unicités d'idempotence ;
  - un code d'erreur Postgres se lit dans `error.cause` (drizzle enveloppe l'erreur de `pg`) ; `ON DELETE RESTRICT` renvoie `23001`, pas `23503`.
- **Composants** : Testing Library pour les composants synchrones ; Server Components `async`, layouts et parcours complets en E2E (recommandation Next).
- **Réseau** : serveur MSW partagé (`src/test/msw/server.ts`) démarré pour tous les tests, **sans handler par défaut** ; chaque test déclare ses réponses (`server.use(http.get(...))`) avec des URL en `.test` ; une requête non simulée échoue (`onUnhandledRequest: "error"`). Futures sources : fixtures dans `src/features/sources/<id>/__fixtures__/`, fabriques de handlers partagées au même endroit si besoin ; Anthropic simulé de la même façon (le SDK passe par `fetch`).
- **Couverture** : tous les fichiers de `src/` comptent (même jamais chargés) ; seuils 80 % **par fichier** sur `src/lib/**` et `src/features/*/core/**` (un fichier de pure configuration s'exclut explicitement, avec justification relue en PR) ; pas de seuil sur `src/app` (couvert par l'E2E). Un seuil ne s'abaisse jamais pour faire passer.
- **E2E** : `retries: 0` (un test instable se corrige) ; trace conservée en cas d'échec ; rapports dans `playwright-report/` et `test-results/` (ignorés par git).
- **Navigateur** : `pnpm exec playwright install --only-shell chromium` (une fois par poste, hors dépôt ; en CI en P0-04).
- **Journaux** : le logger est injectable (`createLogger({ level, write, report, now })`) ; un test qui vérifie des journaux passe sa propre sortie et un `report` simulé. `LOG_LEVEL=silent` pour tous les tests (vitest.config.ts). Le SDK Sentry se simule par `vi.mock("@sentry/core")` ou `vi.mock("@sentry/nextjs")`.
- **Preuves par mutation** (garde-fous de sécurité, thème) : **commiter avant** de muter, casser volontairement le garde-fou, montrer le test ou le lint qui échoue, restaurer avec `git restore` et revérifier. Consigner chaque mutation dans la section « Réalisé » du plan.
- **E2E sans Sentry** : `playwright.config.ts` force `SENTRY_DSN` vide ; `observabilite.spec.ts` vérifie qu'aucune requête ne part vers Sentry et qu'aucune source map n'est servie.
- **Interdits appliqués par ESLint** (et par le hook de Claude) : `.only`, `.skip`, `.fixme`, `expect` conditionnel, `process.env` dans les tests.
- **Faux secrets et données d'essai** (P0-07) : aucun littéral au format réel d'un fournisseur (jeton Telegram, JWT, clés Anthropic, Resend, GitHub, AWS, Stripe, DSN Sentry réel, clé privée) ; les fabriquer à l'exécution avec `src/test/secrets-factices.ts`. gitleaks et le secret scanning lisent tout l'historique, qu'on ne réécrit pas. Emails des tests, fixtures et exemples de données sur domaines réservés (`example.com`, `.org`, `.net`, `*.example`, `*.test`, `*.invalid`, `*.localhost` ; `sentry.io` seulement pour l'hôte d'un DSN d'essai). `src/test/litteraux-secrets.test.ts` le vérifie sur les fichiers suivis par git (jamais par parcours du disque) et ne cite jamais la valeur trouvée.
- **Dans le bac à sable de Claude** (ADR 0011) :
  - `pnpm test`, `verify` et `build` lancés par Claude tournent sans `.env.local`, comme la CI. Les journaux `Failed to load env … EPERM` et les avertissements pnpm sur `~/Library/Preferences/pnpm/rc` sont attendus.
  - `pnpm test:e2e` ne tourne pas dans le bac à sable (Chromium y est refusé) : l'utilisateur le lance dans son terminal, après avoir relu `git diff` et supprimé `.next`, et la CI le rejoue sur chaque PR.
  - `pnpm dev` y tourne sans rechargement à chaud.
  - Sur un poste neuf, un premier `pnpm test` dans le terminal crée le jeton de Vitest.
  - Sondes de confinement : `bash scripts/test-sandbox.sh` (SECURITY §7).
- **Vérification de fin de tour** : `bash scripts/verifie-modifs.sh` (Prettier sur les fichiers modifiés, typecheck, tests liés) note l'empreinte qu'exige le hook Stop ; les hooks n'exécutent eux-mêmes aucun code du dépôt.
- **Hooks de Claude** : `bash scripts/test-hooks.sh` (refus attendus et contre-épreuves calquées sur les commandes des skills), lancé aussi en CI (job `quality`). Les preuves par mutation se font sur une **copie** des hooks (scratchpad), jamais sur les fichiers du dépôt.
- **En CI** (P0-04) : job `quality` = `pnpm verify` (couverture comprise) ; job `e2e` = installation du navigateur à chaque exécution (pas de cache, recommandation Playwright) puis `pnpm test:e2e` ; rapports en artefact (7 jours) en cas d'échec. Les deux sont des checks requis pour fusionner.
- **Charte** (P0-05) : `src/lib/design-tokens.test.ts` échoue si `globals.css` s'écarte de `docs/design/tokens.json` ou si une paire de couleurs d'usage passe sous le seuil WCAG AA ; l'E2E `tests/e2e/styleguide.spec.ts` vérifie le guide de style (focus visible, polices auto-hébergées, aucune requête vers Google, axe).
