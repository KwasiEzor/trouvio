# Roadmap — Trouvio

> **Source de vérité de l'avancement.** Claude Code coche les cases au fil des tâches terminées (Definition of Done de `CLAUDE.md` respectée). Une phase ne démarre que lorsque la **porte de sortie** de la précédente est franchie.
> Identifiant de tâche = `P<phase>-<numéro>` (utilisé dans les noms de branche et les commits).

## Jalons
- **M1 — MVP personnel** (fin P5) : Kwasi reçoit chaque matin un digest Telegram trié par l'IA. → début de l'auto-test de 2 semaines.
- **M2 — Bêta** (fin P8) : comptes, application web, site public, 20–50 testeurs.
- **M3 — Lancement** (fin P10) : facturation, durcissement, exploitation.

---

## P0 — Fondations
- [x] **P0-00** Outillage Claude Code : `CLAUDE.md` allégé, règles `.claude/rules/` par chemin, sous-agents, commandes du workflow, hooks de garde et de validation, permissions. *Accept.* : `bash scripts/test-hooks.sh` vert. Plan : `docs/plans/P0-00.md`.
- [x] **P0-00b** Cohérence des documents avant de coder (job M1 sans serveur, exclusions, dédoublonnage, bandes d'éval, seed hors dépôt, plafond de coût, étude des sources, Notion reporté). *Accept.* : aucune contradiction restante entre les documents. Plan : `docs/plans/P0-00b.md`.
- [x] **P0-01** Initialiser Next.js (App Router, TS strict, `src/`), pnpm, ESLint, Prettier. *Accept.* : `pnpm dev` et `pnpm build` passent.
- [x] **P0-02** `src/lib/env.ts` : validation Zod de toutes les variables (`.env.example` à jour) ; installe Vitest minimal et `pnpm test`. *Accept.* : démarrage refusé si une variable requise manque, test unitaire à l'appui. Plan : `docs/plans/P0-02.md`.
- [x] **P0-03** Testing Library + MSW, Playwright, couverture (Vitest installé en P0-02) ; `pnpm verify` complet. *Accept.* : un test de chaque type passe. Plan : `docs/plans/P0-03.md`.
- [x] **P0-04** CI GitHub Actions (`ci.yml`, `security.yml`, `codeql.yml`), Dependabot, protection de branche `main` (dépôt public, ADR 0009). *Accept.* : une PR factice déclenche tous les contrôles. Plan : `docs/plans/P0-04.md`.
- [x] **P0-05** Tailwind + shadcn/ui avec thème issu de `docs/design/tokens.json`, polices Poppins/Work Sans, logos dans `public/brand`. *Accept.* : page `/styleguide` affichant couleurs, typos, boutons. Plan : `docs/plans/P0-05.md`.
- [ ] **P0-06** `lib/logger` (JSON structuré, sans PII) et Sentry. *Accept.* : une erreur volontaire lancée en local remonte dans le projet Sentry de développement.
**Porte P0** : CI verte sur `main`, aucune alerte de sécurité ouverte.

## P1 — Données & authentification
- [ ] **P1-01** Schéma Drizzle complet (ARCHITECTURE §5) + première migration + seed lu depuis `db/seed.local.json` (ignoré par git ; `db/seed.example.json` commité avec des valeurs fictives). *Accept.* : `pnpm db:migrate` sur base vierge puis seed OK ; aucune donnée personnelle dans le dépôt.
- [ ] **P1-02** Better Auth (email + mot de passe, lien magique), sessions en base, rôles `user`/`admin`. *Accept.* : inscription, connexion, déconnexion testées en E2E.
- [ ] **P1-03** Helpers d'autorisation (`requireUser`, `requireAdmin`, requêtes scopées par `userId`). *Accept.* : tests IDOR — un utilisateur ne peut lire/modifier aucune ressource d'un autre.
- [ ] **P1-04** Rate limiting sur routes d'auth et formulaires publics. *Accept.* : test dépassement → 429.
- [ ] **P1-05** En-têtes de sécurité (SECURITY §3) : CSP avec nonce (via `proxy.ts`), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. *Accept.* : test vérifiant chaque en-tête sur une page et une route API ; aucun script autorisé par `unsafe-inline`. *Note P0-06* : Sentry navigateur exige `connect-src https://o<id>.ingest.de.sentry.io` (ou `tunnelRoute` fixe exclu du `matcher` de `proxy.ts`) ; `requestId` transmis au logger par `child()`.
**Porte P1** : tests d'autorisation verts, revue `security-reviewer` sans point bloquant.

## P2 — Collecte des offres
- [ ] **P2-00** Étude des sources : couverture réelle pour la Wallonie (volume d'offres sur une semaine, via les API ou leurs consoles), CGU, quotas, format d'accès du Forem. *Accept.* : rapport `docs/sources.md` avec décision garder / remplacer / retirer pour chaque source, validée avant P2-02.
- [ ] **P2-01** Interface `JobSource`, types `RawOffer`/`NormalizedOffer`, client HTTP commun (timeout, retry, backoff). *Accept.* : tests unitaires du retry.
- [ ] **P2-02** Adapter **France Travail** (OAuth2 client credentials, cache du token). *Accept.* : tests de contrat sur fixtures réelles anonymisées.
- [ ] **P2-03** Adapter **Adzuna**. *Accept.* : idem + respect du quota (compteur).
- [ ] **P2-04** Adapter **Le Forem** (open data). *Accept.* : idem.
- [ ] **P2-05** Normalisation (contrat, salaire, remote, localisation) + `dedup_hash`. *Accept.* : ≥ 20 cas de test dont doublons inter-sources **et** faux doublons (même source, même intitulé, offres distinctes → jamais fusionnées) ; rattachement par `canonical_offer_id`.
- [ ] **P2-06** Persistance idempotente (upsert). *Accept.* : relancer deux fois la collecte ne crée aucun doublon.
**Porte P2** : collecte réelle manuelle réussie sur les 3 sources, rapport chiffré.

## P3 — Scoring IA
- [ ] **P3-01** `prompts/scoring.v1.md` + schéma Zod de sortie + client Anthropic (`lib/llm`). *Accept.* : sortie invalide → `unscored`, jamais d'exception non gérée ; balises de délimitation (`<offre>`, `</offre>`, `<profil>`…) neutralisées dans le texte de l'offre ; mapping `points_forts`/`points_de_vigilance`/`raison` → `strengths`/`concerns`/`reason` testé.
- [ ] **P3-02** Filtre dur avant IA (contrat, zone, mots-clés et entreprises exclus, feedback négatif) pour économiser les appels. *Accept.* : tests unitaires.
- [ ] **P3-03** Scoring par lots, concurrence limitée, enregistrement coût/tokens/version. *Accept.* : coût d'un run affiché dans `job_runs.stats`.
- [ ] **P3-04** Jeu de référence `evals/scoring-golden.jsonl` (≥ 30 offres étiquetées par Kwasi) + `pnpm eval:scoring`. *Accept.* : accord ≥ 80 %, zéro inversion haute/basse.
- [ ] **P3-05** Tests d'injection de prompt (offres piégées). *Accept.* : aucune instruction contenue dans une offre ne modifie le format ou le score attendu, y compris une offre qui contient `</offre>` suivi de fausses instructions.
**Porte P3** : évaluation ≥ seuil, coût mesuré pour le profil de Kwasi ≤ 30 % du prix de la formule Économique.

## P4 — Diffusion
- [ ] **P4-01** Sélection du digest (≥ seuil, tri, max 10, offres exclues ou marquées « pas pertinent » retirées). *Accept.* : tests unitaires.
- [ ] **P4-02** Canal **Telegram** (bot, liaison du compte par code à usage unique). *Accept.* : message reçu depuis l'environnement local via un bot Telegram de test.
- [ ] **P4-03** Canal **Email** (Resend, template sobre, lien de désinscription). *Accept.* : email reçu, rendu vérifié.
- [ ] **P4-04** Idempotence des envois (`deliveries`). *Accept.* : double exécution → un seul message.

## P5 — Orchestration
- [ ] **P5-01** `runDailyJob()` (orchestration collecte → scoring → digest) + point d'entrée CLI `pnpm job:run`, verrou `pg_advisory_lock` (ADR 0008). *Accept.* : test d'intégration de bout en bout avec sources et LLM simulés ; un second lancement concurrent s'arrête sans rien faire. *Note P0-06* : `createDefaultLogger({ runtime: "job" })`, `@sentry/node` à la version exacte de `@sentry/core`, `flush` avant la sortie ; journaux Actions publics = agrégats seulement (ARCHITECTURE §9).
- [ ] **P5-02** Workflow `daily-job.yml` : exécution quotidienne de `pnpm job:run` dans GitHub Actions + déclenchement manuel, secrets dans un environnement GitHub `production` limité à ce workflow. *Accept.* : exécution planifiée réussie, aucun secret dans les journaux du workflow.
- [ ] **P5-03** Observabilité du job (`job_runs`, alertes Sentry en cas d'échec). *Accept.* : échec simulé d'une source → alerte, les autres sources continuent. *Note P0-06* : une capture par source et par exécution (quota gratuit de 5 000 erreurs/mois).
**Porte P5 = Jalon M1** : 7 jours consécutifs de digest sans intervention → **début de l'auto-test (2 semaines)**, ajustement du prompt (v2) à partir des retours.

## P6 — Application web (espace connecté)
Référence visuelle : `docs/design/mockups/` (Main, Offre, Suivi, Configuration, Statistiques).
- [ ] **P6-01** Layout applicatif (barre latérale, en-tête, carte formule). 
- [ ] **P6-02** Fil d'offres (bandeau digest, stats, filtres, cartes avec anneau de score, « pas pertinent »).
- [ ] **P6-03** Détail d'une offre (analyse, compétences, actions, offres similaires).
- [ ] **P6-04** Suivi kanban (changement de statut, relance suggérée).
- [ ] **P6-05** Configuration (profil, localisation/contrat, seuil avec aperçu, canaux, fréquence).
- [ ] **P6-06** Statistiques (courbe, sources, entonnoir, export CSV).
*Accept. global* : parcours E2E « se connecter → consulter une offre → l'ajouter au suivi → la marquer postulée » ; audit accessibilité sans erreur critique.

## P7 — Site public & pages légales
- [ ] **P7-01** Accueil, Fonctionnalités, Tarifs, Contact (maquettes de référence), SEO (métadonnées, sitemap, OG).
- [ ] **P7-02** Connexion / Inscription redessinées (disposition scindée).
- [ ] **P7-03** Mentions légales, politique de confidentialité (RGPD), cookies (consentement minimal : aucun traceur non essentiel par défaut).
- [ ] **P7-04** Export et suppression de compte (droits RGPD). *Accept.* : suppression effective vérifiée en base.

## P8 — Administration
- [ ] **P8-01** Tableau de bord admin (utilisateurs, MRR, coût IA, rétention, quotas sources) — accès `admin` uniquement.
- [ ] **P8-02** Alertes (quota source > 80 %, coût IA d'un utilisateur > 30 % du prix de sa formule).
**Porte P8 = Jalon M2 (bêta)** : revue sécurité complète, sauvegarde/restauration testée, 20 testeurs invités.

## P9 — Facturation
- [ ] **P9-01** Stripe Checkout + portail client, formules Gratuit/Économique/Confort.
- [ ] **P9-02** Webhooks signés et idempotents, synchronisation du plan.
- [ ] **P9-03** Limites par formule (sources, canaux, modèle IA, plafond de coût IA ; plafond fixe pour la formule Gratuite).

## P10 — Durcissement & lancement
- [ ] **P10-01** Audit sécurité final (`/security-audit`), correction de tous les points hauts.
- [ ] **P10-02** Dockerfile (sortie `standalone`), déploiement Hostinger VPS via GitHub Actions, HTTPS, reverse proxy ; point d'entrée qui valide l'environnement avant `server.js` (ARCHITECTURE §8). *Accept.* : conteneur lancé sans `APP_URL` → sortie code 1, noms des variables manquantes affichés sans valeur. *Note P0-06* : `SENTRY_DSN` présent au build (figé dans le bundle navigateur) ; projet Sentry de production ; upload des source maps avec un jeton de build réservé à la production (`sourcemaps.disable` à revoir).
- [ ] **P10-03** Sauvegardes (Neon PITR + export), runbook incident (`docs/RUNBOOK.md`).
- [ ] **P10-04** Tests de charge légers (100 utilisateurs simulés sur le job quotidien).
- [ ] **P10-05** Route `POST /api/cron/run` sur le serveur déployé (secret, temps constant, même verrou que `pnpm job:run`) et décision d'y basculer le job ou de le garder dans GitHub Actions (ADR 0008). *Accept.* : 401 sans secret, 409 si déjà en cours.
**Porte P10 = Jalon M3 (lancement)**.
