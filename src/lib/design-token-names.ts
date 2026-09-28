/**
 * Noms des tokens de la charte, sans aucune dépendance : importable par du code client
 * (cn, composants) sans embarquer Zod ni tokens.json. Les valeurs vivent dans design-tokens.ts.
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

export const RADIUS_TOKEN_NAMES = [
  "radius-sm",
  "radius-md",
  "radius-lg",
] as const;
export type RadiusTokenName = (typeof RADIUS_TOKEN_NAMES)[number];

export const SPACING_TOKEN_NAMES = [
  "space-2",
  "space-4",
  "space-6",
  "space-8",
] as const;
export type SpacingTokenName = (typeof SPACING_TOKEN_NAMES)[number];
