# ADR 0007 — Magic UI pour le site public, en complément de shadcn/ui
**Statut** : accepté · **Date** : 2026-09

## Contexte
Le site public (P7 : accueil, fonctionnalités, tarifs, contact) doit convaincre en quelques secondes. Écrire ses effets à la main prend du temps. Magic UI propose des composants animés compatibles avec shadcn/ui (même CLI `shadcn`, même Tailwind, code copié dans le dépôt), qui dépendent de la bibliothèque `motion`.

Contraintes existantes :
- Les 12 maquettes (`docs/design/mockups/`) ne contiennent aucune animation. La charte est sobre, et le turquoise `brand` doit rester rare (`docs/design/README.md`).
- Pages de l'app < 2 s de LCP en 4G et WCAG 2.1 AA (PRD §6).
- CSP stricte (SECURITY §3), couleurs uniquement par les tokens (CLAUDE.md §5).

## Décision
1. **shadcn/ui reste la base** de toute l'interface : formulaires, tableaux, dialogues, navigation.
2. **Magic UI est autorisé sur le site public** (`src/app/(public)/`), avec une liste fermée de composants :
   - `marquee`, `bento-grid`, `number-ticker`, `border-beam`, `shimmer-button`, `animated-list`, `blur-fade`, `safari`, `iphone`, `dot-pattern`, `grid-pattern`.
3. **Dans l'application** (`src/app/(app)/`), seuls `number-ticker` (statistiques) et `border-beam` (bandeau du digest) sont autorisés.
4. **Interdits partout** : `globe`, `particles`, `meteors`, `confetti`, `cool-mode`, `aurora-text`, `rainbow-button`, `warp-background`, les textes animés en boucle, et tout composant qui charge WebGL ou un canvas en continu.
5. **Installation** dans un dossier séparé, pour distinguer le code copié de shadcn :
   `pnpm dlx shadcn@latest add @magicui/<composant> --path src/components/magicui`
6. **Adaptation obligatoire à l'installation**, dans le même commit :
   - remplacer toute couleur codée en dur (valeurs par défaut des props incluses) par les tokens du thème ;
   - respecter `prefers-reduced-motion` : l'animation est désactivée et l'état final est affiché ;
   - garder le composant client (`"use client"`) le plus petit possible, pour que la page reste un Server Component ;
   - vérifier que la CSP ne demande pas `unsafe-inline` pour les scripts.
7. Tout ajout à la liste autorisée passe par une mise à jour de cet ADR.

## Conséquences
+ Site public plus vivant sans écrire d'animations à la main ; code dans le dépôt, modifiable, sans dépendance d'exécution à Magic UI.
+ Même CLI et même thème que shadcn : pas de second système de design.
− Nouvelle dépendance `motion` (poids du bundle client) : à mesurer sur les pages concernées (Lighthouse en P7-01).
− Adaptation manuelle de chaque composant (tokens, mouvement réduit) : coût ponctuel à chaque installation.
− Pas de mises à jour automatiques : le code copié évolue avec nous, pas avec Magic UI.

## Alternatives écartées
- **Magic UI partout** : contraire à la sobriété des maquettes, risque sur la performance et l'accessibilité de l'app.
- **Animations CSS maison** uniquement : possible, mais plus lent à produire pour le site public.
- **Aceternity UI** et bibliothèques similaires : effets plus chargés encore, même problème de charte.
