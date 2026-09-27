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
- Base de données de test isolée (conteneur Postgres en CI, ou branche Neon dédiée), réinitialisée par suite.
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
| `pnpm test` | Vitest, deux projets : `node` (`*.test.ts`) et `dom` (`*.test.tsx`, jsdom + Testing Library) |
| `pnpm test:coverage` | idem + couverture v8 et seuils (inclus dans `pnpm verify`) |
| `pnpm test:e2e` | Playwright (chromium) sur un **build de production** (`next build` + `next start` sur le port 3100, `APP_URL` fourni par la config, aucun fichier `.env`) ; contrôle d'accessibilité axe (WCAG A/AA) |
| `pnpm exec vitest run --project dom` | un seul projet |

- **Tests colocalisés**, `globals: false` (imports explicites depuis `vitest`).
- **Composants** : Testing Library pour les composants synchrones ; Server Components `async`, layouts et parcours complets en E2E (recommandation Next).
- **Réseau** : serveur MSW partagé (`src/test/msw/server.ts`) démarré pour tous les tests, **sans handler par défaut** ; chaque test déclare ses réponses (`server.use(http.get(...))`) avec des URL en `.test` ; une requête non simulée échoue (`onUnhandledRequest: "error"`). Futures sources : fixtures dans `src/features/sources/<id>/__fixtures__/`, fabriques de handlers partagées au même endroit si besoin ; Anthropic simulé de la même façon (le SDK passe par `fetch`).
- **Couverture** : tous les fichiers de `src/` comptent (même jamais chargés) ; seuils 80 % **par fichier** sur `src/lib/**` et `src/features/*/core/**` (un fichier de pure configuration s'exclut explicitement, avec justification relue en PR) ; pas de seuil sur `src/app` (couvert par l'E2E). Un seuil ne s'abaisse jamais pour faire passer.
- **E2E** : `retries: 0` (un test instable se corrige) ; trace conservée en cas d'échec ; rapports dans `playwright-report/` et `test-results/` (ignorés par git).
- **Navigateur** : `pnpm exec playwright install --only-shell chromium` (une fois par poste, hors dépôt ; en CI en P0-04).
- **Interdits appliqués par ESLint** (et par le hook de Claude) : `.only`, `.skip`, `.fixme`, `expect` conditionnel, `process.env` dans les tests.
