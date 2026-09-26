# ADR 0003 — Authentification avec Better Auth
**Statut** : accepté

## Contexte
Auth email/mot de passe + lien magique, sessions en base, rôles simples, données hébergées chez nous (RGPD), coût nul.

## Décision
**Better Auth** avec l'adaptateur Drizzle, sessions en base, cookies HttpOnly/Secure/SameSite=Lax.

## Conséquences
+ Données d'auth dans notre base, pas de fournisseur tiers facturé à l'utilisateur.
+ Extensible (2FA, OAuth) plus tard.
− Responsabilité de configuration sécurisée : couverte par les tests P1 et la checklist SECURITY §5.

## Alternatives écartées
Clerk (excellent mais coût par utilisateur actif et données chez un tiers) ; Auth.js (possible, API jugée moins directe pour email/mot de passe).
