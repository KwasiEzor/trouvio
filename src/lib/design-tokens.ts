import { z } from "zod";

import rawTokens from "../../docs/design/tokens.json";
import {
  COLOR_TOKEN_NAMES,
  RADIUS_TOKEN_NAMES,
  SPACING_TOKEN_NAMES,
  TYPE_STYLE_NAMES,
  type ColorTokenName,
  type RadiusTokenName,
  type SpacingTokenName,
  type TypeStyleName,
} from "./design-token-names";

export * from "./design-token-names";

/**
 * Tokens de la charte (docs/design/tokens.json), validés au chargement. Serveur uniquement
 * (Zod + JSON) : le code client importe les noms depuis design-token-names.ts.
 * Source unique : le thème CSS (src/app/globals.css) en est la traduction, vérifiée par test.
 */

const px = z.string().regex(/^\d+px$/);
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Chaque nom attendu apparaît une et une seule fois. */
function complet<T extends { name: string }>(noms: readonly string[]) {
  return (entrees: T[]) =>
    entrees.length === noms.length &&
    noms.every((nom) => entrees.some((e) => e.name === nom));
}

const schema = z.object({
  version: z.number().int(),
  color: z.object({
    themes: z
      .array(z.object({ id: z.string() }))
      .refine((themes) => themes.some((theme) => theme.id === "light")),
    tokens: z
      .array(
        z.object({
          name: z.enum(COLOR_TOKEN_NAMES),
          value: z.object({ light: z.string().regex(HEX) }),
          usage: z.string().min(1),
        }),
      )
      .refine(complet(COLOR_TOKEN_NAMES), {
        message: "couleurs incomplètes ou en double",
      }),
  }),
  type: z.object({
    groups: z
      .array(
        z.object({
          family: z.enum(["display", "sans"]),
          styles: z.array(
            z.object({
              name: z.enum(TYPE_STYLE_NAMES),
              fontSize: px,
              lineHeight: px,
              fontWeight: z.number().int(),
            }),
          ),
        }),
      )
      .refine(
        (groupes) =>
          complet(TYPE_STYLE_NAMES)(groupes.flatMap((g) => g.styles)),
        {
          message: "styles de texte incomplets ou en double",
        },
      ),
  }),
  spacing: z.object({
    tokens: z
      .array(z.object({ name: z.enum(SPACING_TOKEN_NAMES), value: px }))
      .refine(complet(SPACING_TOKEN_NAMES), {
        message: "espacements incomplets ou en double",
      }),
  }),
  radius: z.object({
    tokens: z
      .array(z.object({ name: z.enum(RADIUS_TOKEN_NAMES), value: px }))
      .refine(complet(RADIUS_TOKEN_NAMES), {
        message: "rayons incomplets ou en double",
      }),
  }),
});

export type DesignTokens = {
  colors: { name: ColorTokenName; value: string; usage: string }[];
  typeStyles: {
    name: TypeStyleName;
    family: "display" | "sans";
    fontSize: string;
    lineHeight: string;
    fontWeight: number;
  }[];
  spacing: { name: SpacingTokenName; value: string }[];
  radii: { name: RadiusTokenName; value: string }[];
};

export function parseDesignTokens(raw: unknown): DesignTokens {
  const parsed = schema.parse(raw);
  return {
    colors: parsed.color.tokens.map(({ name, value, usage }) => ({
      name,
      value: value.light,
      usage,
    })),
    typeStyles: parsed.type.groups.flatMap(({ family, styles }) =>
      styles.map((style) => ({ ...style, family })),
    ),
    spacing: parsed.spacing.tokens,
    radii: parsed.radius.tokens,
  };
}

export const designTokens: DesignTokens = parseDesignTokens(rawTokens);

/** "13px" → "0.8125rem" (base 16 px) : les tailles suivent le zoom texte du navigateur. */
export function pxToRem(value: string): string {
  return `${Number.parseFloat(value) / 16}rem`;
}

function canaux(hex: string): [number, number, number] {
  if (!HEX.test(hex))
    throw new Error(`Couleur invalide : ${hex} (attendu #RRGGBB)`);
  return [1, 3, 5].map((debut) =>
    Number.parseInt(hex.slice(debut, debut + 2), 16),
  ) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = canaux(hex).map((valeur) => {
    const c = valeur / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.x entre deux couleurs #RRGGBB (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Couleur perçue d'un premier plan d'opacité `alpha` posé sur un fond opaque (composition sRGB). */
export function compositeOver(fg: string, bg: string, alpha: number): string {
  const [avant, arriere] = [canaux(fg), canaux(bg)];
  const melange = avant.map((c, i) =>
    Math.round(alpha * c + (1 - alpha) * (arriere[i] ?? 0)),
  );
  return `#${melange.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

/** Paires réellement utilisées par l'interface et leur seuil WCAG AA (4,5 texte, 3 non textuel). */
export const CONTRAST_PAIRS: ReadonlyArray<{
  fg: ColorTokenName;
  bg: ColorTokenName;
  min: 4.5 | 3;
  usage: string;
}> = [
  {
    fg: "ink",
    bg: "surface",
    min: 4.5,
    usage: "texte principal sur le fond de page",
  },
  {
    fg: "ink",
    bg: "surface-raised",
    min: 4.5,
    usage: "texte principal sur une carte",
  },
  {
    fg: "ink",
    bg: "brand-dim",
    min: 4.5,
    usage: "texte sur un état sélectionné ou survolé",
  },
  {
    fg: "ink-muted",
    bg: "surface",
    min: 4.5,
    usage: "texte secondaire sur le fond de page",
  },
  {
    fg: "ink-muted",
    bg: "surface-raised",
    min: 4.5,
    usage: "texte secondaire sur une carte",
  },
  {
    fg: "ink-muted",
    bg: "brand-dim",
    min: 4.5,
    usage: "texte secondaire sur un état sélectionné",
  },
  {
    fg: "surface-raised",
    bg: "brand-strong",
    min: 4.5,
    usage: "texte du bouton principal",
  },
  {
    fg: "brand-strong",
    bg: "surface",
    min: 4.5,
    usage: "lien sur le fond de page",
  },
  {
    fg: "brand-strong",
    bg: "surface-raised",
    min: 4.5,
    usage: "lien sur une carte",
  },
  {
    fg: "brand-strong",
    bg: "brand-dim",
    min: 4.5,
    usage: "texte turquoise sur un état sélectionné",
  },
  {
    fg: "brand-strong",
    bg: "surface",
    min: 3,
    usage: "anneau de focus sur le fond de page",
  },
  {
    fg: "brand",
    bg: "surface-raised",
    min: 3,
    usage: "symbole et éléments décoratifs",
  },
];
