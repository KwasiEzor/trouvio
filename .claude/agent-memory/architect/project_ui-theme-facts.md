---
name: ui-theme-facts
description: Faits verifies (2026-09-27, plan P0-05) sur Tailwind v4, shadcn (paquet cn), next/font, contrastes des tokens Trouvio et logos - a reutiliser pour P6/P7 et tout ajout de composant shadcn
metadata:
  type: project
---

- Contrastes WCAG des tokens v2 (calcules) : blanc sur brand #1F9997 = 3.46 (ECHEC texte normal) ; brand sur surface 3.15, sur surface-raised 3.46, sur brand-dim 2.91 ; ink-muted sur surface 4.19 (ECHEC), sur raised 4.62, sur brand-dim 3.87 ; ink partout > 9. #145F5D (fin des degrades des maquettes) : blanc dessus 7.43. Turquoise le plus proche passant 4.5 sur blanc/surface/brand-dim : #157573. ink-muted passant partout : #5F6A78. Toute modif de tokens.json = decision humaine.
- shadcn (CLI 4.21, sept. 2026) : les composants du registre importent `cn` depuis le paquet npm `cn` (shadcn-ui/cn, 0.x, zero dependance, nom repris d'un paquet de 2013) au lieu de @/lib/utils ; le style "index" installe class-variance-authority, cn, lucide-react, radix-ui + devDeps tw-animate-css et shadcn (pour `@import "shadcn/tailwind.css"`). Tailles de texte personnalisees (text-body, text-label...) : il FAUT un cn configure (createCn de "cn/config" ou extendTailwindMerge), sinon text-label + text-<couleur> = conflit et la taille disparait.
- Button new-york-v4 : rounded-md, text-sm font-medium, focus = box-shadow ring-ring/50 (invisible en forced-colors, contraste < 3:1), variantes dark: (en v4, dark: = prefers-color-scheme sauf @custom-variant), destructive avec text-white.
- Tailwind 4.3.3 / @tailwindcss/oxide / lightningcss : aucun script d'installation (binaires en optionalDependencies). La detection automatique des classes scanne docs/ (maquettes HTML) : restreindre avec `source("..")`.
- next/font/google en build : 3 tentatives puis echec du BUILD si Google injoignable (en dev : repli). Auto-heberge, aucune requete navigateur vers Google. Poppins non variable (weight obligatoire) ; Work Sans variable. Sous-ensemble latin contient oe et euro.
- next/image : src en .svg -> unoptimized automatique (pas de dangerouslyAllowSVG). Next 16 : `priority` deprecie -> `preload`. icon.svg accepte dans app/.
- Logos public/brand/*.svg : ~10 Ko chacun dont ~8 Ko de manifeste C2PA (Content Credentials Anthropic, aucune donnee personnelle).

**Why:** verifie en planifiant P0-05 (registre npm, registre shadcn, sources next/font, docs tailwindcss.com / nextjs.org).
**How to apply:** tout `shadcn add` (P6, P7, Magic UI ADR 0007) : reecrire l'import cn, retirer dark:/destructive non tokenises, verifier contraste et focus. Voir [[tooling-gotchas]], [[github-ci-facts]].
