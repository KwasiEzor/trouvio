---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/features/**/components/**"
  - "src/lib/design-tokens.ts"
  - "src/lib/design-token-names.ts"
  - "src/lib/utils.ts"
  - "postcss.config.mjs"
  - "docs/design/**"
  - "src/app/globals.css"
  - "components.json"
---

# Règles interface

- Skills : `shadcn-ui` pour les composants, `next-best-practices` (RSC, data fetching), `vercel-react-best-practices` (performance). Audit `design:accessibility-review` sur les parcours principaux.
- Couleurs, rayons, typos **uniquement** via le thème dérivé de `docs/design/tokens.json`. Aucune couleur en dur (hex, rgb) hors du fichier de thème.
- Référence visuelle : maquette correspondante dans `docs/design/mockups/` (voir `docs/design/README.md`). S'en inspirer, ne pas copier le HTML.
- Server Components par défaut ; `"use client"` seulement pour l'interactivité.
- Contenu d'offre affiché en texte brut ; **jamais** `dangerouslySetInnerHTML` sur une donnée externe.
- WCAG 2.1 AA : labels, focus visible, contraste, navigation clavier.
- Textes en français, tutoiement, ton direct.

## Magic UI (ADR 0007)
- **shadcn/ui d'abord.** Magic UI ne sert qu'aux effets, jamais pour un formulaire, un tableau, un dialogue ou la navigation.
- **Autorisé sur le site public** (`src/app/(public)/`) : `marquee`, `bento-grid`, `number-ticker`, `border-beam`, `shimmer-button`, `animated-list`, `blur-fade`, `safari`, `iphone`, `dot-pattern`, `grid-pattern`.
- **Dans l'app** (`src/app/(app)/`) : seulement `number-ticker` (statistiques) et `border-beam` (bandeau du digest).
- **Interdits** : `globe`, `particles`, `meteors`, `confetti`, `cool-mode`, `aurora-text`, `rainbow-button`, `warp-background`, textes animés en boucle, tout WebGL ou canvas continu. Ajouter un composant = mettre à jour l'ADR 0007 d'abord.
- **Installation** : `pnpm dlx shadcn@latest add @magicui/<composant> --path src/components/magicui` (jamais dans `src/components/ui/`).
- **Adaptation dans le même commit que l'installation** :
  - couleurs codées en dur, y compris les valeurs par défaut des props (`color = "#..."`, `colorFrom`, `colorTo`), remplacées par les tokens (`var(--brand)`…) ;
  - `prefers-reduced-motion` respecté (`useReducedMotion` de `motion`, ou `motion-safe:`/`motion-reduce:` de Tailwind) : sans animation, l'état final s'affiche ;
  - composant client minimal : la page reste un Server Component et ne passe au composant que des données sérialisables ;
  - un seul effet animé visible à la fois dans un écran ; le turquoise reste rare.
- **Vérifications** : Lighthouse (LCP, CLS) sur la page concernée, pas de nouvelle exigence CSP `unsafe-inline` pour les scripts.

## Thème et shadcn/ui (P0-05)
- Thème = `src/app/globals.css`, traduction exacte de `docs/design/tokens.json` (test `src/lib/design-tokens.test.ts`). Changer une couleur, une taille ou un rayon = modifier **tokens.json puis globals.css** ; le test de contrastes doit rester vert.
- Couleurs : `brand-strong` (#157573) pour tout ce qui porte du texte (bouton principal, liens, focus) ; `brand` (#1F9997) seulement pour le symbole et le décoratif, jamais pour du texte.
- Rôles shadcn disponibles : `background`, `foreground`, `card`, `popover`, `primary`, `muted`, `accent`, `border`, `input`, `ring` (+ `-foreground`). Pas de `destructive` ni de `secondary` tant qu'aucun token n'existe.
- Tailles de texte : `text-display`, `text-h1`, `text-h2`, `text-body`, `text-body-sm`, `text-label` (jamais `text-sm`, `text-xs`…). Rayons : `rounded-sm|md|lg`. ESLint (`better-tailwindcss/no-unknown-classes`) refuse toute autre classe.
- `cn` s'importe **uniquement** depuis `@/lib/utils` (configuré avec les tailles du thème).
- **Ajouter un composant shadcn** :
  1. `pnpm dlx shadcn@<version exacte> view <composant>` (jamais `@latest`) et lire le code avant toute écriture ;
  2. l'écrire dans `src/components/ui/` : import `cn` depuis `@/lib/utils`, classes du thème uniquement, retirer `dark:*` et les variantes sans token ;
  3. **focus par contour** : `outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring` — `outline-solid` est indispensable (Tailwind v4 : `outline-hidden` met le style à « none ») ; pas d'anneau en ombre ;
  4. test Testing Library (rôle, nom accessible, états) et passage au guide de style `/styleguide` (E2E + axe).
- **Tables de classes** : toute constante qui associe des clés à des classes Tailwind s'appelle `CLASSES_*` (ex. `CLASSES_NUANCIERS`) et utilise `satisfies Record<…Name, string>` : ESLint analyse alors ses valeurs, et un token ajouté sans sa classe casse le typecheck.
- **Code client** : importer les noms de tokens depuis `@/lib/design-token-names` (sans dépendance) ; `@/lib/design-tokens` (Zod + JSON) est réservé au serveur.
- **Volontairement non verrouillé** (valeurs par défaut de Tailwind, à resserrer si besoin) : familles `font-mono`/`font-serif`, ombres, interlignage et approche (`leading-*`, `tracking-*`), largeurs de conteneur, espacements (l'échelle par défaut correspond déjà aux tokens : `p-2` = `space-2`).
- **États de survol** : toute opacité de survol sur un fond qui porte du texte doit garder 4,5:1 (test « états de survol » de `design-tokens.test.ts`, qui lit l'opacité dans `button.tsx`).
