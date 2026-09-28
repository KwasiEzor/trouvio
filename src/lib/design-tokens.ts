import { z } from "zod";

import rawTokens from "../../docs/design/tokens.json";

/**
 * Tokens de la charte (docs/design/tokens.json), validés au chargement.
 * Source unique : le thème CSS (src/app/globals.css) en est la traduction, vérifiée par test.
 * Ajouter une couleur ou un style ici oblige à mettre à jour le CSS et le styleguide.
 */

export const COLOR_TOKEN_NAMES = [
  "surface",
  "surface-raised",
  "ink",
  "ink-muted",
  "brand",
  "brand-strong",
  "brand-dim",
  "border",
] as const;
export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];

export const TYPE_STYLE_NAMES = [
  "display",
  "h1",
  "h2",
  "body",
  "body-sm",
  "label",
] as const;
export type TypeStyleName = (typeof TYPE_STYLE_NAMES)[number];

const px = z.string().regex(/^\d+px$/);

const schema = z.object({
  version: z.number().int(),
  color: z.object({
    themes: z
      .array(z.object({ id: z.string() }))
      .refine((themes) => themes.some((t) => t.id === "light")),
    tokens: z
      .array(
        z.object({
          name: z.enum(COLOR_TOKEN_NAMES),
          value: z.object({ light: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }),
          usage: z.string().min(1),
        }),
      )
      .refine(
        (tokens) =>
          tokens.length === COLOR_TOKEN_NAMES.length &&
          COLOR_TOKEN_NAMES.every((name) =>
            tokens.some((token) => token.name === name),
          ),
        { message: "chaque couleur attendue doit apparaître une seule fois" },
      ),
  }),
  type: z.object({
    groups: z.array(
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
    ),
  }),
  spacing: z.object({
    tokens: z.array(
      z.object({ name: z.string().regex(/^space-\d+$/), value: px }),
    ),
  }),
  radius: z.object({
    tokens: z.array(
      z.object({
        name: z.enum(["radius-sm", "radius-md", "radius-lg"]),
        value: px,
      }),
    ),
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
  spacing: { name: string; value: string }[];
  radii: { name: "radius-sm" | "radius-md" | "radius-lg"; value: string }[];
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

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.x entre deux couleurs #RRGGBB (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
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
    usage: "texte sur un état sélectionné",
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
