import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import vitest from "@vitest/eslint-plugin";
import playwright from "eslint-plugin-playwright";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";

const ENV_MESSAGE =
  "Lire les variables d'environnement via src/lib/env.ts (validé par Zod).";

// Les interdits de CLAUDE.md §5 sont appliqués ici à tout le monde (humains, CI),
// en plus des hooks .claude/hooks/ qui ne protègent que les éditions de Claude.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "react/no-danger": "error",
    },
  },
  // Variables d'environnement : uniquement via src/lib/env.ts (CLAUDE.md §5), dans tout le code
  // applicatif et outillé. Les *.config.* à la racine restent libres (lus par les outils) ; une
  // config qui a besoin d'une variable applicative importe src/lib/env.ts.
  {
    files: [
      "src/**/*.{ts,tsx}",
      "scripts/**/*.{ts,mts}",
      "db/**/*.ts",
      "evals/**/*.ts",
      "tests/**/*.ts",
    ],
    ignores: ["src/lib/env.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: ENV_MESSAGE },
      ],
      "no-restricted-syntax": [
        "error",
        {
          // globalThis.process.env, global.process.env
          selector:
            "MemberExpression[property.name='env'][object.type='MemberExpression'][object.property.name='process']",
          message: ENV_MESSAGE,
        },
        {
          // globalThis.process["env"]
          selector:
            "MemberExpression[object.property.name='process'][property.value='env']",
          message: ENV_MESSAGE,
        },
        {
          // globalThis["process"]
          selector:
            "MemberExpression[object.name=/^(globalThis|global)$/][property.value='process']",
          message: ENV_MESSAGE,
        },
        {
          // const { env } = globalThis.process
          selector:
            "VariableDeclarator[init.type='MemberExpression'][init.property.name='process'] > ObjectPattern > Property[key.name='env']",
          message: ENV_MESSAGE,
        },
        {
          // Reflect.get(process, "env")
          selector:
            "CallExpression[callee.object.name='Reflect'][arguments.0.name='process']",
          message: ENV_MESSAGE,
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "process", importNames: ["env"], message: ENV_MESSAGE },
            {
              name: "node:process",
              importNames: ["env"],
              message: ENV_MESSAGE,
            },
            {
              // Le cn brut ignore les tailles de texte du thème (text-label serait effacée).
              name: "cn",
              message:
                "Importer cn depuis @/lib/utils (configuré avec le thème).",
            },
          ],
        },
      ],
    },
  },
  // Thème verrouillé (ADR 0007, P0-05) : seules les classes générées depuis src/app/globals.css
  // (donc depuis docs/design/tokens.json) sont admises ; aucune couleur arbitraire.
  {
    files: ["src/**/*.tsx"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: { "better-tailwindcss": { entryPoint: "src/app/globals.css" } },
    rules: {
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: "\\[#[0-9a-fA-F]{3,8}\\]",
              message: "Couleur en dur interdite : utiliser un token du thème.",
            },
            {
              pattern: "\\[(rgb|rgba|hsl|hsla|oklch|oklab)\\(",
              message: "Couleur en dur interdite : utiliser un token du thème.",
            },
          ],
        },
      ],
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-deprecated-classes": "error",
    },
  },
  // Tests Vitest : .only et .skip interdits pour tous (humains, CI), pas seulement pour Claude.
  {
    files: ["src/**/*.test.{ts,tsx}"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
    },
  },
  // Tests E2E Playwright : idem, fixme compris.
  {
    files: ["tests/e2e/**/*.ts"],
    extends: [playwright.configs["flat/recommended"]],
    rules: {
      "playwright/no-focused-test": "error",
      "playwright/no-skipped-test": [
        "error",
        { allowConditional: false, disallowFixme: true },
      ],
    },
  },
  // Désactive les règles de style qui entreraient en conflit avec Prettier (toujours en dernier).
  prettier,
  // ESLint (config flat) ne lit pas .gitignore : répéter ici les sorties générées.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "evals/results/**",
  ]),
]);

export default eslintConfig;
