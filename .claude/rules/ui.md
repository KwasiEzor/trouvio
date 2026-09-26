---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/features/**/components/**"
  - "tailwind.config.*"
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
