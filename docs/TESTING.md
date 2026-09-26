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
