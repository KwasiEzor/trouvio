# ADR 0015 — Limitation de débit
**Statut** : accepté · **Date** : 2026-10 · Plan : `docs/plans/P1-04.md` · Complète l'ADR 0013.

## Contexte
Le limiteur intégré de Better Auth n'est actif qu'en production, garde ses compteurs en mémoire (remis à zéro à chaque déploiement), et ne voit que le handler HTTP : il ignore le bourrage d'identifiants réparti sur plusieurs IP et le volume d'emails envoyés à une même adresse. Next conserve un `x-forwarded-for` envoyé par le client. Les refus admin écrivent chacun une ligne de journal. Better Auth 1.7.7 accepte un stockage personnalisé (`rateLimit.customStorage`, opération `consume` atomique), et son limiteur tourne avant la résolution de la route.

## Décision
1. **Un seul limiteur, à fenêtre fixe, sur Postgres** (`src/lib/rate-limit/`, table `rate_limits`, `src/lib/db/rate-limit-store.ts`) : un `INSERT … ON CONFLICT DO UPDATE … RETURNING` par appel, toutes règles comprises, clés triées (pas d'interblocage). Les refus incrémentent aussi : marteler ne réarme pas la fenêtre. Purge opportuniste par lots (`FOR UPDATE SKIP LOCKED`) tous les 100 appels par processus. Une panne du magasin remonte : la requête échoue (500), jamais acceptée.
2. **Clés pseudonymisées** : `HMAC-SHA256` de la portée, de la fenêtre et du sujet, avec une clé dérivée de `BETTER_AUTH_SECRET` ; un `CHECK` en base refuse toute clé qui n'est pas une empreinte. Ni IP ni email dans la table (SECURITY §4). Une rotation du secret remet les compteurs à zéro.
3. **Par IP**, branché sur Better Auth par `customStorage`, actif partout (`enabled: true`, développement compris) : 10 / 5 min sur `/sign-in/email`, 5 / 10 min sur `/sign-up/email` et `/sign-in/magic-link`, 3 / 10 min sur `/send-verification-email`, 5 / 60 s sur `/magic-link/verify`, 100 / 10 s ailleurs (`src/lib/rate-limit/rules.ts`). Tout chemin hors de la liste des chemins servis tombe dans un seau commun par IP, pour borner le nombre de compteurs.
4. **Résolution d'IP** : `getIP` de Better Auth sur le seul `x-forwarded-for`, IPv6 ramenée au /64, sans `trustedProxies` ni `disableIpTracking` (tous deux interdits par test). Contrat avec le reverse proxy, vérifié au déploiement (P10-02) : Caddy n'envoie qu'une valeur (l'IP du client, en ignorant l'en-tête entrant) et le port de l'application n'est pas publié. Une chaîne à plusieurs valeurs n'est pas résolue : clé partagée `no-trusted-ip` en production.
5. **Par compte** (`src/lib/auth/account-lock.ts`, `hooks.before` sur `/sign-in/email`) : 10 tentatives / 15 min et 30 / 24 h par email normalisé, comptées avant la vérification du mot de passe, succès compris. Réponse 429 `TOO_MANY_ATTEMPTS`, identique que l'adresse ait un compte ou non. S'applique aussi à `auth.api.signInEmail`. Seule la connexion par mot de passe est bloquée : le lien magique reste un accès de secours, que le message d'interface propose.
6. **Par destinataire** (`capRecipients`, `src/lib/auth/mailer.ts`) : 3 emails / 15 min et 10 / 24 h, tous types confondus. Au-delà, l'envoi est sauté en silence : la réponse ne change pas (uniformité de l'ADR 0013).
7. **Journaux limités** : un refus admin par utilisateur et par 10 minutes, les suivants comptés (`suppressed`) ; un `warn` « limite atteinte » par portée et par fenêtre, sans IP ni email (`src/lib/logger/throttle.ts`, en mémoire).

## Conséquences
- \+ Comportement identique en développement, en test d'intégration et en production ; compteurs persistants aux redéploiements, partagés entre instances.
- \+ Le test d'acceptation (dépassement → 429) tourne sur le handler HTTP réel et sur le build de production (`tests/e2e/limiteur.spec.ts`).
- − Une écriture en base par requête `/api/auth/*`, `/get-session` compris (à surveiller si `proxy.ts` la relaie, P1-05).
- − `hooks.before` passe **avant** le contrôle d'origine : une tentative à l'origine refusée (403) compte pour le verrou. Sans effet pour un attaquant, qui pose une origine valide depuis un client direct ; ne pas reproduire ce contrôle dans le hook (une lecture divergente ouvrirait un contournement).
- − Un compte peut être verrouillé par un tiers (connexion par mot de passe seulement, jusqu'à 24 h) ; parade : le lien magique.
- − Un NAT partagé (école, entreprise) partage un compteur ; seuils à revoir avec les métriques (P10-01).
- − Sans la table (`pnpm db:migrate:local` oublié), toute requête `/api/auth/*` répond 500.

## Alternatives écartées
- **Mémoire de Better Auth pour l'IP, Postgres pour le reste** : deux mécanismes, remise à zéro à chaque déploiement, comportement de production non testé.
- **Stockage `"database"` de Better Auth** : 2 à 3 requêtes par appel, IP en clair dans la table.
- **Redis / Upstash** : nouvelle infrastructure et nouveau sous-traitant, sans besoin à cette échelle.
- **Compter seulement les échecs de connexion** : N essais parallèles passeraient avant le premier échec enregistré.
- **429 au-delà du plafond d'emails** : la réponse du lien magique changerait, pas celle de l'inscription (Better Auth avale ces erreurs-là).
- **`trustedProxies` / variable `TRUSTED_PROXIES`** : inutile tant que Caddy écrase l'en-tête ; à configurer côté Caddy si un CDN s'intercale.
- **CAPTCHA** : tiers et accessibilité ; à reconsidérer si les métriques montrent de l'abus.
