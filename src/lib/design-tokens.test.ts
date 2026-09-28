import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

import rawTokens from "../../docs/design/tokens.json";
import {
  COLOR_TOKEN_NAMES,
  CONTRAST_PAIRS,
  compositeOver,
  contrastRatio,
  designTokens,
  parseDesignTokens,
  pxToRem,
} from "./design-tokens";

// Le thème CSS doit rester la traduction exacte de docs/design/tokens.json.
const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const ast = postcss.parse(css);
const theme = new Map<string, string>();
const staticTheme = new Map<string, string>();
ast.walkAtRules("theme", (rule) => {
  if (rule.params === "static")
    rule.walkDecls((decl) => void staticTheme.set(decl.prop, decl.value));
});
ast.walkAtRules("theme", (rule) =>
  rule.walkDecls((decl) => void theme.set(decl.prop, decl.value)),
);
const rootVars = new Map<string, string>();
ast.walkRules(":root", (rule) =>
  rule.walkDecls((decl) => void rootVars.set(decl.prop, decl.value)),
);

const colorValue = new Map<string, string>(
  designTokens.colors.map((token) => [token.name, token.value]),
);

function clone(): unknown {
  return JSON.parse(JSON.stringify(rawTokens)) as unknown;
}

describe("thème CSS ↔ tokens.json", () => {
  it.each(designTokens.colors)(
    "déclare la couleur $name avec sa valeur exacte",
    ({ name, value }) => {
      expect(theme.get(`--color-${name}`)?.toLowerCase()).toBe(
        value.toLowerCase(),
      );
    },
  );

  it.each(designTokens.typeStyles)(
    "déclare le style de texte $name (taille, interligne en rem, graisse)",
    ({ name, fontSize, lineHeight, fontWeight }) => {
      expect(theme.get(`--text-${name}`)).toBe(pxToRem(fontSize));
      expect(theme.get(`--text-${name}--line-height`)).toBe(
        pxToRem(lineHeight),
      );
      expect(theme.get(`--text-${name}--font-weight`)).toBe(String(fontWeight));
    },
  );

  it.each(designTokens.radii)("déclare le rayon $name", ({ name, value }) => {
    expect(theme.get(`--${name}`)).toBe(value);
  });

  it("garde l'échelle d'espacement de Tailwind, alignée sur les tokens (space-N = N × 4 px)", () => {
    expect(theme.has("--spacing")).toBe(false);
    for (const { name, value } of designTokens.spacing) {
      const step = Number(name.replace("space-", ""));
      expect(value).toBe(`${step * 4}px`);
    }
  });

  it("remet à zéro les palettes par défaut : seules les valeurs des tokens existent", () => {
    expect(theme.get("--color-*")).toBe("initial");
    expect(theme.get("--radius-*")).toBe("initial");
    expect(theme.get("--text-*")).toBe("initial");
  });

  it("n'utilise aucune couleur hexadécimale absente de tokens.json", () => {
    const connues = new Set(
      [...colorValue.values()].map((value) => value.toLowerCase()),
    );
    const inconnues = (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter(
      (hex) => !connues.has(hex.toLowerCase()),
    );
    expect(inconnues).toEqual([]);
  });

  it("relie chaque variable shadcn à un token de couleur", () => {
    const attendues = [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--border",
      "--input",
      "--ring",
    ];
    for (const variable of attendues) {
      const token = /^var\(--color-([a-z-]+)\)$/.exec(
        rootVars.get(variable) ?? "",
      )?.[1];
      expect(COLOR_TOKEN_NAMES, `${variable} → ${token ?? "absent"}`).toContain(
        token,
      );
    }
  });
});

describe("thème CSS ⊂ tokens.json (sens inverse)", () => {
  it("ne déclare dans @theme static que les variables issues des tokens, ni plus ni moins", () => {
    const attendues = [
      "--color-*",
      "--radius-*",
      "--text-*",
      ...designTokens.colors.map(({ name }) => `--color-${name}`),
      ...designTokens.typeStyles.flatMap(({ name }) => [
        `--text-${name}`,
        `--text-${name}--line-height`,
        `--text-${name}--font-weight`,
      ]),
      ...designTokens.radii.map(({ name }) => `--${name}`),
    ].sort();
    expect([...staticTheme.keys()].sort()).toEqual(attendues);
  });
});

describe("contrastes WCAG des paires d'usage", () => {
  it.each(CONTRAST_PAIRS)(
    "$fg sur $bg atteint $min:1 ($usage)",
    ({ fg, bg, min }) => {
      const ratio = contrastRatio(
        colorValue.get(fg) ?? "",
        colorValue.get(bg) ?? "",
      );
      expect(ratio).toBeGreaterThanOrEqual(min);
    },
  );

  it("le texte du bouton principal est lisible sur son fond (variables shadcn résolues)", () => {
    const tokenOf = (variable: string) =>
      /^var\(--color-([a-z-]+)\)$/.exec(rootVars.get(variable) ?? "")?.[1] ??
      "";
    const ratio = contrastRatio(
      colorValue.get(tokenOf("--primary-foreground")) ?? "",
      colorValue.get(tokenOf("--primary")) ?? "",
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("états de survol", () => {
  const source = readFileSync(
    new URL("../components/ui/button.tsx", import.meta.url),
    "utf8",
  );
  const opacite =
    Number(/hover:bg-primary\/(\d+)/.exec(source)?.[1] ?? "100") / 100;
  const primaire = colorValue.get("brand-strong") ?? "";
  const texte = colorValue.get("surface-raised") ?? "";

  it.each(["surface", "surface-raised"])(
    "le texte du bouton principal reste lisible au survol sur %s",
    (fond) => {
      const survol = compositeOver(
        primaire,
        colorValue.get(fond) ?? "",
        opacite,
      );
      expect(contrastRatio(texte, survol)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("outils", () => {
  it.each([
    ["13px", "0.8125rem"],
    ["16px", "1rem"],
    ["44px", "2.75rem"],
  ])("convertit %s en %s", (px, rem) => {
    expect(pxToRem(px)).toBe(rem);
  });

  it("compose une couleur semi-transparente sur un fond (comme le navigateur)", () => {
    expect(compositeOver("#157573", "#FFFFFF", 0.9)).toBe("#2C8381");
    expect(compositeOver("#157573", "#FFFFFF", 1)).toBe("#157573");
  });

  it("refuse une couleur mal formée plutôt que de renvoyer NaN", () => {
    expect(() => contrastRatio("#12345", "#FFFFFF")).toThrow();
    expect(() => compositeOver("rouge", "#FFFFFF", 0.5)).toThrow();
  });

  it("calcule le contraste maximal (noir sur blanc = 21) et minimal (identiques = 1)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1F9997", "#1F9997")).toBeCloseTo(1, 5);
  });
});

describe("schéma de tokens.json", () => {
  it("accepte le fichier actuel", () => {
    expect(() => parseDesignTokens(rawTokens)).not.toThrow();
  });

  it("refuse une couleur hexadécimale mal formée", () => {
    const donnees = clone() as {
      color: { tokens: { value: { light: string } }[] };
    };
    const premier = donnees.color.tokens[0];
    if (premier) premier.value.light = "#12345";
    expect(() => parseDesignTokens(donnees)).toThrow();
  });

  it("refuse une couleur inconnue du code (ajout non répercuté)", () => {
    const donnees = clone() as { color: { tokens: { name: string }[] } };
    const premier = donnees.color.tokens[0];
    if (premier) premier.name = "nouvelle-couleur";
    expect(() => parseDesignTokens(donnees)).toThrow();
  });

  it("refuse un fichier où il manque une couleur attendue", () => {
    const donnees = clone() as { color: { tokens: { name: string }[] } };
    donnees.color.tokens = donnees.color.tokens.filter(
      (token) => token.name !== "brand-strong",
    );
    expect(() => parseDesignTokens(donnees)).toThrow();
  });

  it("refuse un fichier où il manque un style de texte attendu", () => {
    const donnees = clone() as {
      type: { groups: { styles: { name: string }[] }[] };
    };
    for (const groupe of donnees.type.groups) {
      groupe.styles = groupe.styles.filter((style) => style.name !== "label");
    }
    expect(() => parseDesignTokens(donnees)).toThrow();
  });

  it("refuse un rayon en double", () => {
    const donnees = clone() as { radius: { tokens: { name: string }[] } };
    const dernier = donnees.radius.tokens[2];
    if (dernier) dernier.name = "radius-sm";
    expect(() => parseDesignTokens(donnees)).toThrow();
  });

  it("refuse un espacement inconnu du code", () => {
    const donnees = clone() as { spacing: { tokens: { name: string }[] } };
    const premier = donnees.spacing.tokens[0];
    if (premier) premier.name = "space-12";
    expect(() => parseDesignTokens(donnees)).toThrow();
  });
});
