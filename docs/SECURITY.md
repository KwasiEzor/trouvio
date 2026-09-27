# Sécurité — Trouvio

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
| Fuite de secrets | Commit, logs | Push protection GitHub (blocage au push, motifs des fournisseurs seulement), gitleaks en CI (motifs génériques compris, après le push), logger sans PII ni secrets, `.env*` bloqué par hook |
| Dépendance compromise | Supply chain | Lockfile, `minimumReleaseAge` 24 h, `strictDepBuilds`, Dependabot (délai 7 j), `pnpm audit`, dependency-review, CodeQL |
| Webhooks falsifiés | Stripe/Telegram | Vérification de signature/secret, idempotence |

## 3. Contrôles techniques obligatoires
- En-têtes : `Content-Security-Policy` (sans `unsafe-inline` pour les scripts), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- Validation Zod de **toutes** les entrées (params, body, query, env, sorties LLM, réponses des API sources).
- Server Actions et routes API : vérification d'auth + d'appartenance en première ligne.
- Mots de passe : hachage géré par Better Auth (algorithme moderne), longueur minimale 8, vérification contre les mots de passe compromis si possible.
- Journaux : jamais d'email, de token, de contenu de profil complet ; identifiants pseudonymes.
- Principe du moindre privilège : rôle DB applicatif sans droits DDL en production ; le job GitHub Actions utilise ce même rôle, jamais le propriétaire de la base.

## 4. RGPD (Belgique — autorité : APD)
- Base légale : exécution du contrat (service) ; consentement pour tout traceur non essentiel.
- Minimisation : le LLM reçoit uniquement les critères de recherche, pas l'identité.
- Sous-traitants à lister dans la politique de confidentialité (hébergement, base de données, IA, email, paiement, monitoring).
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
| CodeQL `security-extended` (JS/TS), aussi chaque lundi ; règle `code_scanning` du ruleset : fusion refusée si une alerte de sécurité haute ou plus, ou une erreur, est introduite | CodeQL + ruleset | oui |
| Secret scanning + push protection (motifs des fournisseurs ; motifs génériques et vérification de validité non disponibles) | GitHub | blocage au push |
| Dependabot : alertes, correctifs de sécurité, mises à jour groupées | GitHub | — |
| Protection de `main` (ruleset « main protégée ») : PR obligatoire (fusion squash), 6 checks requis (`quality`, `e2e`, `gitleaks`, `audit`, `dependency-review`, `CodeQL`) sur branche à jour, règle `code_scanning`, force-push et suppression interdits, aucune dérogation | GitHub | oui |
| Hooks locaux (pre-push, garde-fous de Claude) | poste | oui |

Workflows : permissions en lecture seule par défaut, actions épinglées par SHA (obligatoire au niveau du dépôt, actions autorisées : GitHub + `pnpm/action-setup`), aucun `pull_request_target`, aucun secret. Vérifiés ponctuellement par zizmor 1.30.1 (P0-04, aucun constat) : le relancer à chaque modification de `.github/`.

**Si un secret atteint `main`** (fusion squash, force-push interdit, donc historique non réécrit) :
1. **Révoquer et remplacer le secret immédiatement** chez le fournisseur (c'est la seule vraie correction) ;
2. retirer la valeur du code par une nouvelle PR ;
3. ajouter à la racine un `.gitleaksignore` contenant l'empreinte affichée par le job (`commit:fichier:règle:ligne`), avec en PR la justification « secret révoqué le <date> » — sinon `gitleaks` resterait rouge sur toutes les PR suivantes ;
4. consigner l'incident (date, portée, révocation).
