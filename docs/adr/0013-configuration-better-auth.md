# ADR 0013 — Configuration de Better Auth
**Statut** : accepté · **Date** : 2026-10 · Plan : `docs/plans/P1-02.md` · Complète l'ADR 0003.

## Contexte
L'ADR 0003 retient Better Auth (adaptateur Drizzle, sessions en base, cookies `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS). La bibliothèque laisse beaucoup de choix de sécurité à la configuration : vérification d'email, gestion des rôles, contrôles d'origine, journaux, télémétrie, variables d'environnement lues directement. Version retenue : `better-auth` 1.7.7, source lue avant installation (plan P1-02, §0).

## Décision
1. **Vérification d'email obligatoire** (`requireEmailVerification: true`) avant toute connexion par mot de passe. C'est aussi la condition pour qu'une inscription sur une adresse déjà prise réponde comme une inscription neuve : pas d'énumération des comptes. Le titulaire reçoit un email « tu as déjà un compte ». Après vérification, la personne est connectée (`autoSignInAfterVerification`), une seule fois.
2. **Rôle par champ additionnel `input: false`**, sans plugin `admin` : une valeur envoyée par le client est remplacée par `user`. `/update-user` est désactivé. Un admin naît du seed seulement. Le plugin `admin` est écarté : son `role` est un texte à virgules, incompatible avec l'enum `user_role`, et il ouvre des routes `/admin/*`.
3. **Une seule porte, le handler HTTP** `/api/auth/*`. Les formulaires l'appellent par `authClient`, jamais par des Server Actions qui appelleraient `auth.api.*` : celles-ci contourneraient le contrôle d'origine et le limiteur intégré.
4. **Contrôle d'origine explicite** : `trustedOrigins: [APP_URL]` et `advanced.disableOriginCheck: false`. Better Auth coupe ce contrôle par défaut quand `NODE_ENV` vaut `test` : sans cette option explicite, les tests d'intégration ne prouveraient rien. `callbackURL` est toujours une constante du code (`AUTH_PATHS`).
5. **Lien magique** : 10 minutes, usage unique, jeton haché en base (`storeToken: "hashed"`). Inscription par lien magique permise : l'email est prouvé par le clic.
6. **Emails par un port** (`AuthMailer`). Jusqu'à P4-03, seul transport : une boîte d'envoi sur disque (`AUTH_EMAIL_OUTBOX_DIR`), **refusée au démarrage hors boucle locale**. Sans transport, l'envoi échoue (échec fermé) plutôt que de laisser croire qu'un email est parti.
7. **Minimisation** : IP et agent utilisateur des sessions non stockés (colonnes présentes, valeurs nulles par un hook `session.create.before`). Le limiteur calcule l'IP à la volée.
8. **Environnement maîtrisé** : `BETTER_AUTH_SECRET` validé par `src/lib/env.ts` et passé en option. `BETTER_AUTH_SECRETS` (qui prendrait le pas sur lui), `BETTER_AUTH_TELEMETRY` et `BETTER_AUTH_TELEMETRY_ENDPOINT` sont refusées au démarrage. Télémétrie coupée dans la configuration.
9. **Journaux** : `logger.log` de Better Auth branché sur `lib/logger`, qui masque emails et jetons. Une « erreur » sans `Error` (origine ou `callbackURL` refusée) devient un `warn` : une sonde d'attaquant ne consomme pas le quota Sentry.
10. **Instance paresseuse** (`getAuth()`) : rien n'est lu à l'import, le build n'exige ni base ni secret.
11. **Tables écrites à la main** d'après `getAuthTables`, sans la CLI Better Auth : tables au pluriel (`usePlural`), colonnes `timestamptz`, contraintes nommées, dans `db/schema.ts`. Un test de parité permanent et le contrôle de schéma de Better Auth à l'exécution gardent l'accord.
12. **Mot de passe** : 12 à 128 caractères, scrypt (défaut). Contrôle des mots de passe compromis reporté à P10-01 : le plugin `haveibeenpwned` échoue fermé et rendrait l'inscription dépendante d'un tiers.

## Conséquences
- \+ Réponses uniformes (inscription, connexion, lien magique) : aucune énumération de comptes par l'API.
- \+ Le client ne peut ni choisir son rôle ni écrire son plan ; prouvé par des tests d'intégration sur vraie base.
- \+ Les tests vérifient le comportement de production du contrôle d'origine.
- − Aucun email réel avant P4-03 : un déploiement ne peut pas inscrire de compte d'ici là (aucun n'est prévu avant P10).
- − Le limiteur intégré est en mémoire et ne couvre que le handler HTTP ; `x-forwarded-for` est falsifiable derrière un proxy non configuré. Traité en P1-04.
- − Pas de réinitialisation du mot de passe avant P7-02 ; le lien magique sert d'accès de secours.

## Alternatives écartées
- **Plugin `admin`** : rôle textuel, routes supplémentaires (décision 2).
- **Server Actions** appelant `auth.api.*` : hors du limiteur et du contrôle d'origine (décision 3).
- **CLI Better Auth** (`auth generate`) : sortie à réécrire (fichier séparé, `timestamp` sans fuseau, `users` régénérée), exécution d'un paquet hors bac à sable ; une génération ponctuelle ne garde rien dans le temps (décision 11).
- **Stocker IP et agent utilisateur** : aucune fonctionnalité ne les lit (décision 7).
