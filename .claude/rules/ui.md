---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/features/**/components/**"
  - "tailwind.config.*"
  - "src/app/globals.css"
---

# Règles interface

- Skills : `shadcn-ui` pour les composants, `next-best-practices` (RSC, data fetching), `vercel-react-best-practices` (performance). Audit `design:accessibility-review` sur les parcours principaux.
- Couleurs, rayons, typos **uniquement** via le thème dérivé de `docs/design/tokens.json`. Aucune couleur en dur (hex, rgb) hors du fichier de thème.
- Référence visuelle : maquette correspondante dans `docs/design/mockups/` (voir `docs/design/README.md`). S'en inspirer, ne pas copier le HTML.
- Server Components par défaut ; `"use client"` seulement pour l'interactivité.
- Contenu d'offre affiché en texte brut ; **jamais** `dangerouslySetInnerHTML` sur une donnée externe.
- WCAG 2.1 AA : labels, focus visible, contraste, navigation clavier.
- Textes en français, tutoiement, ton direct.
