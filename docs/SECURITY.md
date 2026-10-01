# Sécurité — Trouvio

## Signaler une vulnérabilité
Ne décris jamais une faille dans une issue ou une PR publique. Utilise le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability** (https://github.com/KwasiEzor/trouvio/security/advisories/new). Indique les étapes pour reproduire et l'impact supposé. Réponse visée sous 7 jours ; la correction est publiée avant toute divulgation.

Référentiels : OWASP Top 10, OWASP ASVS niveau 2 (cible), OWASP Top 10 pour applications LLM, RGPD.

## 1. Actifs à protéger
Comptes et sessions · profils de recherche (prétentions salariales, critères) · historique de candidatures · clés API (Anthropic, France Travail, Adzuna, Telegram, Stripe, Resend) · budget IA.

## 2. Modèle de menaces (résumé)
| Menace | Vecteur | Contrôle principal |
|---|---|---|
| Accès aux données d'un autre utilisateur (IDOR) | Id manipulé dans l'URL/API | Toute requête scopée par `userId` de session ; tests IDOR obligatoires |
| Vol de session | XSS, cookie mal configuré | Cookies HttpOnly/Secure/SameSite=Lax, CSP stricte, pas de `dangerouslySetInnerHTML` sur contenu d'offre |
| Injection de prompt | Texte d'offre piégé | Contenu délimité et déclaré non fiable, sortie validée Zod, aucun outil exposé au modèle |
| XSS stockée | Description d'offre affichée | Rendu texte brut ou sanitisation (liste blanche) ; jamais de HTML brut |
| Déclenchement abusif du job | Appel public de `/api/cron/run` (après déploiement) | Secret Bearer, comparaison à temps constant, verrou `pg_advisory_lock` |
| Fuite des secrets du job | Workflow GitHub Actions qui exécute le job (ADR 0008) | Environnement GitHub `production` limité au workflow du job, aucun secret exposé aux PR ni aux forks, pas d'`echo` de variables, journaux relus |
| Explosion des coûts IA | Boucle, abus | Filtre dur avant IA, plafonds par utilisateur/jour, alerte admin |
| Brute force / spam | Formulaires auth/contact | Rate limiting, lien magique à usage unique et expirant |
| Fuite de secrets | Commit, logs, lecture par l'agent | Push protection GitHub (blocage au push, motifs des fournisseurs seulement), gitleaks en CI (motifs génériques compris, après le push), test de garde des littéraux de secrets (`src/test/litteraux-secrets.test.ts`, faux secrets fabriqués à l'exécution), logger sans PII ni secrets. `.env*` : la **frontière** est le bac à sable Bash de Claude Code (Seatbelt, ADR 0011), qui confine chaque commande et ses descendants et refuse aussi la lecture du dossier personnel ; les hooks n'exécutent aucun code du dépôt ; ils restent le **filet** (lecture directe, jokers sur fichiers cachés, recherche récursive, noms reconstruits, extraction du trousseau). Voir §7 |
| Dépendance compromise | Supply chain | Lockfile, `minimumReleaseAge` 24 h, `strictDepBuilds`, Dependabot (délai 7 j), `pnpm audit`, dependency-review, CodeQL |
| Webhooks falsifiés | Stripe/Telegram | Vérification de signature/secret, idempotence |
| Fuite par l'outil de suivi d'erreurs | Événement Sentry (requête, cookies, variables locales, messages) | `dataCollection` minimal posé explicitement, `beforeSend`/`beforeBreadcrumb` qui masquent, ni replay ni traces, scrubbers du projet Sentry, région UE (ADR 0010) |

## 3. Contrôles techniques obligatoires
- En-têtes : `Content-Security-Policy` (sans `unsafe-inline` pour les scripts), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- Validation Zod de **toutes** les entrées (params, body, query, env, sorties LLM, réponses des API sources).
- Server Actions et routes API : vérification d'auth + d'appartenance en première ligne.
- Mots de passe : hachage géré par Better Auth (algorithme moderne), longueur minimale 8, vérification contre les mots de passe compromis si possible.
- Journaux : jamais d'email, de token, de contenu de profil complet ; identifiants pseudonymes (`userId` interne). Uniquement via `@/lib/logger`, qui masque clés et valeurs sensibles (ARCHITECTURE §9) ; aucun `console.*` dans `src/`. Limite connue : Next écrit lui-même sur stderr le message et la pile brute d'une erreur serveur, hors logger ; les journaux du conteneur ont donc une rétention courte (P10-02).
- Principe du moindre privilège : rôle DB applicatif sans droits DDL en production ; le job GitHub Actions utilise ce même rôle, jamais le propriétaire de la base.
  - `DATABASE_URL` = rôle applicatif `trouvio_app` (DML) ; `DATABASE_MIGRATION_URL` = propriétaire du schéma, lu par `pnpm db:migrate` seulement. TLS vérifié exigé hors boucle locale : `sslmode=verify-full` seulement (`require` ne vérifie le certificat qu'en pg 8, plus avec `uselibpqcompat` ni en pg 9). Remplacer le `sslmode=require` des chaînes Neon.
  - Mise en place sur Neon, par l'utilisateur, **avant** la première migration : `CREATE ROLE trouvio_app LOGIN` en SQL, **sans mot de passe** (un rôle créé dans la console recevrait `neon_superuser`), puis le mot de passe par `\password trouvio_app` dans psql (seul un hachage SCRAM part : rien en clair dans l'historique de l'éditeur SQL ni dans les journaux), `GRANT USAGE ON SCHEMA public TO trouvio_app`, `ALTER DEFAULT PRIVILEGES FOR ROLE <propriétaire> IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trouvio_app`, branche Neon de sauvegarde, puis `pnpm db:migrate:neon`. Contrôle : en `trouvio_app`, `CREATE TABLE` échoue, `SELECT` réussit, et le rôle n'a aucun droit sur le schéma `drizzle` (journal des migrations).
  - Seed : refusé en production et sur une base distante sans `--allow-remote` ; erreurs sans aucune valeur du fichier ; comptes créés et comptes modifiés comptés à part (l'upsert par email écrase un compte existant) (ADR 0012).
  - Erreurs de requête : drizzle recopie les valeurs liées dans le message (« params: … ») et pg met la ligne fautive dans `detail`. `serializeError` et le `beforeSend` de Sentry les retirent (`maskQueryValues`).
  - Erreurs de connexion (P1-02, résiduel de l'ADR 0012) : Node cite l'hôte ou l'adresse de la base dans le message (`getaddrinfo ENOTFOUND …`, `connect ECONNREFUSED …`) et dans la propriété `hostname`. `redactString` masque la cible, dans les journaux comme dans Sentry.
- Emails d'authentification (P1-02) : déclenchés par la personne elle-même, sans aucun texte saisi dans un formulaire (le nom est choisi par celui qui s'inscrit, pas par le destinataire). Ni le destinataire, ni le lien, ni le jeton ne sont journalisés. Jusqu'à P4-03, seul transport : une boîte d'envoi sur disque (`AUTH_EMAIL_OUTBOX_DIR`, fichiers `0600`), refusée hors boucle locale ; sans transport, l'envoi échoue fermé.

## 4. RGPD (Belgique — autorité : APD)
- Base légale : exécution du contrat (service) ; consentement pour tout traceur non essentiel.
- Minimisation : le LLM reçoit uniquement les critères de recherche, pas l'identité.
- Sous-traitants à lister dans la politique de confidentialité (hébergement, base de données, IA, email, paiement, monitoring). Monitoring : Sentry, organisation en **région UE** (Frankfurt), collecte minimale, IP non stockées, rétention 30 jours (ADR 0010). Réglages de l'organisation : Data Scrubber et scrubbers par défaut exigés, IP non stockées, champs sensibles globaux, Enhanced Privacy, pas d'issues partagées, Spike Protection (le plan gratuit n'offre pas de limite par clé).
- Droits : export (JSON/CSV) et suppression effective du compte ; durée de conservation définie (ex. offres brutes 90 jours).

## 5. Checklist de revue (à passer pour toute PR touchant auth, données, API ou LLM)
- [ ] Chaque nouvelle route/action vérifie l'authentification **et** l'appartenance de la ressource
- [ ] Entrées validées par Zod, erreurs renvoyées sans détail interne
- [ ] Aucun secret, token ou PII dans le code, les logs ou les messages d'erreur
- [ ] Contenu externe (offres, webhooks) traité comme non fiable
- [ ] Requêtes via Drizzle (pas de SQL concaténé)
- [ ] Rate limiting présent si la route est publique
- [ ] Tests négatifs ajoutés (accès refusé, entrée invalide, dépassement)
- [ ] Impact coût IA évalué si la PR modifie le scoring

## 6. Contrôles automatiques en place (P0-04, dépôt public — ADR 0009)
| Contrôle | Où | Bloquant |
|---|---|---|
| `pnpm verify` (lint typé, typecheck, tests + couverture, format, build) | CI `quality` | oui (check requis) |
| E2E Playwright + axe sur build de production | CI `e2e` | oui |
| gitleaks v8.30.1 (binaire vérifié), historique complet du code à fusionner (pas les autres branches) | Security `gitleaks` | oui |
| `pnpm audit --audit-level high` (prod + dev), aussi chaque lundi | Security `audit` | oui |
| dependency-review (nouvelle dépendance vulnérable, gravité haute) | Security `dependency-review` (PR) | oui |
| CodeQL `security-extended` (JS/TS), aussi chaque lundi ; règle `code_scanning` du ruleset : fusion refusée si une alerte de sécurité **moyenne** ou plus, ou une erreur, est introduite (P0-07) ; une alerte écartée l'est avec sa justification en PR | CodeQL + ruleset | oui |
| Tests des hooks de Claude (`scripts/test-hooks.sh`) : refus attendus et contre-épreuves | CI `quality` | oui |
| Signalement privé des vulnérabilités (voir en tête) | GitHub | — |
| Workflows des PR de forks : approbation manuelle pour **tout** contributeur externe (P0-07) | GitHub | — |
| Secret scanning + push protection (motifs des fournisseurs ; motifs génériques et vérification de validité non disponibles) | GitHub | blocage au push |
| Dependabot : alertes, correctifs de sécurité, mises à jour groupées | GitHub | — |
| Protection de `main` (ruleset « main protégée ») : PR obligatoire (fusion squash), 6 checks requis (`quality`, `e2e`, `gitleaks`, `audit`, `dependency-review`, `CodeQL`) sur branche à jour, règle `code_scanning`, force-push et suppression interdits, aucune dérogation | GitHub | oui |
| Hooks locaux (pre-push, garde-fous de Claude) | poste | oui |
| Bac à sable Bash de Claude Code et sondes (`scripts/test-sandbox.sh`, ADR 0011) | poste | oui (`failIfUnavailable`) |

Workflows : permissions en lecture seule par défaut, actions épinglées par SHA (obligatoire au niveau du dépôt, actions autorisées : GitHub + `pnpm/action-setup`), aucun `pull_request_target`, aucun secret. Vérifiés ponctuellement par zizmor 1.30.1 (P0-04, aucun constat) : le relancer à chaque modification de `.github/`.

**Si un secret atteint `main`** (fusion squash, force-push interdit, donc historique non réécrit) :
1. **Révoquer et remplacer le secret immédiatement** chez le fournisseur (c'est la seule vraie correction) ;
2. retirer la valeur du code par une nouvelle PR ;
3. ajouter à la racine un `.gitleaksignore` contenant l'empreinte affichée par le job (`commit:fichier:règle:ligne`), avec en PR la justification « secret révoqué le <date> » — sinon `gitleaks` resterait rouge sur toutes les PR suivantes ;
4. consigner l'incident (date, portée, révocation).

**Faux positif** (faux secret d'un test, alerte n° 1 du 2026-09-29) : fermer l'alerte avec le motif « Used in tests » et sa justification, puis remplacer le littéral par une valeur fabriquée à l'exécution (`src/test/secrets-factices.ts`).

## 7. Bac à sable de Claude Code (P0-08, ADR 0011)
**Réglages** (`.claude/settings.json`, bloc `sandbox`) :
- actif, refus de démarrer sans lui, aucune commande hors bac à sable, aucune approbation automatique ;
- lecture : tout `~` refusé, puis rouvert au plus juste (projet, runtime Node, config git et `gh`, jeton de Vitest, shell de Claude) ; `.env*` du projet refusés à tout niveau, sauf `.env.example` ; `db/seed.local.json` (données personnelles du seed) refusé depuis P1-01 ; le trousseau de session est donc invisible : aucun jeton joignable ;
- écriture : projet et dossier temporaire seulement ; jamais les `.env`, `.githooks`, `node_modules` (paquets, `.bin`, `.pnpm`), ni les chemins protégés d'office (réglages, `hooks`, `skills`, `agents` et `commands` de `.claude`, `.git/hooks`, `.git/config`) ; ni store ni cache pnpm ;
- réseau : npm, `github.com` (`git fetch`), Google Fonts et les domaines `WebFetch` autorisés ; tout autre domaine est demandé.

Les hooks n'exécutent aucun code du dépôt (bash, jq et git seulement) : le hook Stop exige l'empreinte notée par `scripts/verifie-modifs.sh`, que Claude lance dans le bac à sable.

**Aucun secret dans le bac à sable.** Les commandes lancées par Claude tournent sans `.env.local`, comme la CI. Leur base de données est le Postgres Docker local, sans secret, en boucle locale, avec un rôle non superutilisateur (ADR 0012). Se lancent dans le terminal de l'utilisateur (jamais par `!`) : un serveur avec de vrais secrets, `pnpm test:e2e` (Chromium incompatible avec Seatbelt), `pnpm install` / `pnpm add`, `git push` et les commandes `gh` (trousseau fermé ; jeton à grain fin limité au dépôt).

Avant de lancer ces commandes :
- relire `git diff` et `git status` ;
- supprimer `.next`.

**Aucune session Claude ne modifie le code pendant qu'un processus avec de vrais secrets tourne hors bac à sable** (`next dev` recharge chaque modification).

**Preuve.** `bash scripts/test-sandbox.sh`, à relancer après toute modification du bloc `sandbox` ou d'une version de Claude Code. Le script compte 37 sondes, 39 quand `db/seed.local.json` existe :
- 16 sondes de lecture sur un canari `.env.canary` (non secret, ignoré par git), chacune validée sur un témoin lisible ;
- 5 sondes sur `.env.local`, par code de retour seulement ;
- 2 sondes sur `db/seed.local.json`, par code de retour seulement (sautées s'il est absent : le bac à sable refuse aussi de supprimer un fichier qu'il ne peut pas lire, donc pas de canari à sa place) ;
- 5 contre-épreuves, qui doivent réussir ;
- 11 sondes de confinement : lecture de `~`, trousseau invisible, création d'un `.env` en majuscules, écriture dans `~`, le store, `node_modules` et les garde-fous, connexion directe.

Preuve noyau : `sandbox_check` vaut 1 dans le bac à sable.

**Résiduels acceptés :**
- jeton de Vitest lisible (protège l'interface web de Vitest, inutilisée ici) ;
- sortie vers tout port localhost (`allowLocalBinding`) : ne pas laisser de port de débogage ouvert, et **aucun serveur de base de données hors bac à sable en `trust` sur la boucle locale** (ADR 0012 : un superutilisateur joignable lirait `.env.local` par `COPY … FROM PROGRAM`). Un Postgres Homebrew en écoute sur 5432 a été arrêté le 2026-10-01 pour cette raison ;
- façade de domaine possible par les domaines `WebFetch`, et push vers un dépôt tiers par `github.com` avec des identifiants apportés : sorties étroites, les secrets restant illisibles ;
- code exécuté ensuite par l'utilisateur hors bac à sable : règles ci-dessus.

**Sortie de secours** pour une session, par l'utilisateur seulement : `claude --settings '{"sandbox":{"enabled":false}}'`.
