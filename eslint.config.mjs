import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import vitest from "@vitest/eslint-plugin";
import playwright from "eslint-plugin-playwright";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { getDefaultSelectors } from "eslint-plugin-better-tailwindcss/defaults";

const ENV_MESSAGE =
  "Lire les variables d'environnement via src/lib/env.ts (validé par Zod).";

const ENV_IMPORT_PATHS = [
  { name: "process", importNames: ["env"], message: ENV_MESSAGE },
  { name: "node:process", importNames: ["env"], message: ENV_MESSAGE },
];
// Le cn brut ignore les tailles de texte du thème (text-label serait effacée).
const CN_PATTERN = {
  group: ["cn", "cn/*"],
  message: "Importer cn depuis @/lib/utils (configuré avec le thème).",
};
// Sentry.logger.*, Sentry.metrics.* ou un captureException direct contourneraient le masquage de
// lib/logger (ADR 0010). Seuls les points d'intégration listés plus bas importent @sentry/*.
const SENTRY_PATTERN = {
  group: ["@sentry/*"],
  message:
    "Signaler une erreur via logger.error (@/lib/logger), qui masque puis transmet à Sentry.",
};
// Accès détournés à process.env (globalThis, crochets, déstructuration, Reflect).
const ENV_SYNTAX = [
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
];
// Imports de @sentry/* que no-restricted-imports ne voit pas (P0-07) : import() dynamique, y
// compris par gabarit, et createRequire(…)("@sentry/…"). require() est déjà refusé par
// @typescript-eslint/no-require-imports.
const SENTRY_SYNTAX = [
  "ImportExpression[source.value=/^@sentry\\//]",
  "ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.raw=/^@sentry\\//]",
  "CallExpression[arguments.0.value=/^@sentry\\//]",
  "CallExpression[arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/^@sentry\\//]",
].map((selector) => ({ selector, message: SENTRY_PATTERN.message }));
// Code client ou isomorphe (plan P0-06) : …/env, …/lib/env, ../logger, @/lib/logger,
// …/logger/index sont réservés au serveur (pas …/logger/redact). Idem pour la base (P1-01) :
// …/db/* (sauf db/enums, valeurs partagées), pg et drizzle-orm.
const SERVER_ONLY_PATTERN = {
  regex:
    "(^|/)(env|logger(/index)?)$|(^|/)db/(?!enums$)|^(pg|drizzle-orm)(/|$)",
  message:
    "Code client ou isomorphe : ni src/lib/env.ts, ni le logger serveur (@/lib/logger), ni la base (lib/db, pg, drizzle-orm) ; configuration navigateur via @/lib/observability/public-config.",
};

// Accès aux données confiné (P1-03, ADR 0014) : dans src/, seuls lib/db, l'instance Better Auth et
// les dépôts de domaine (src/features/<d>/repo.ts, queries.ts) importent le schéma, la base, pg ou
// drizzle-orm (liste de fichiers autorisés : un nouvel emplacement est interdit par défaut). Tout
// …/db/* sauf db/enums et db/target (purs, sans base), y compris par « ./ » intercalés ou suffixe .js.
const DATA_ACCESS_MESSAGE =
  "Accès aux données réservé aux dépôts (src/features/<domaine>/repo.ts) : requêtes scopées par ownedBy et un UserId tiré de la session (ADR 0014).";
const DATA_ACCESS_REGEX =
  "(^|/)db/(\\./)*(?!(enums|target)(\\.js)?$)[^/]|^(pg|drizzle-orm)(/|$)";
const DATA_ACCESS_PATTERN = {
  regex: DATA_ACCESS_REGEX,
  message: DATA_ACCESS_MESSAGE,
};
// import() dynamique, que no-restricted-imports ne voit pas.
const DATA_ACCESS_SYNTAX = [
  `ImportExpression[source.value=/${DATA_ACCESS_REGEX.replaceAll("/", "\\/")}/]`,
  `ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.raw=/${DATA_ACCESS_REGEX.replaceAll("/", "\\/")}/]`,
].map((selector) => ({ selector, message: DATA_ACCESS_MESSAGE }));
// Le kit de test (src/test/**) fabrique des UserId : jamais importé par le code livré.
const TEST_IMPORT_PATTERN = {
  regex: "(^|/)test/",
  message: "Code livré : aucun import du harnais de tests (src/test/**).",
};
// Un UserId ne se fabrique qu'à partir de la session (src/lib/auth/access.ts) : ni cast (y compris
// par alias, nom qualifié ou CurrentUser["id"]), ni UserId dans une Server Action (son argument
// vient du client). Les tests et src/test/** en sont exemptés.
const USER_ID_MESSAGE =
  "UserId : uniquement depuis la session (requireUser, authorizeRoute), jamais casté ni reçu du client (ADR 0014).";
const USER_ID_SYNTAX = [
  "TSAsExpression > TSTypeReference[typeName.name='UserId']",
  "TSTypeAssertion > TSTypeReference[typeName.name='UserId']",
  "TSAsExpression > TSTypeReference[typeName.right.name='UserId']",
  "TSTypeAssertion > TSTypeReference[typeName.right.name='UserId']",
  "TSAsExpression > TSIndexedAccessType[objectType.typeName.name='CurrentUser']",
  "ImportSpecifier[imported.name='UserId'][local.name!='UserId']",
  "Program:has(> ExpressionStatement[directive='use server']) TSTypeReference[typeName.name='UserId']",
].map((selector) => ({ selector, message: USER_ID_MESSAGE }));
// La marque Zod est structurelle : la recréer hors de access.ts fabriquerait des UserId.
const USER_ID_BRAND_SYNTAX = [
  {
    selector:
      "CallExpression[callee.property.name='brand'] TSLiteralType[literal.value='UserId']",
    message: USER_ID_MESSAGE,
  },
];
// Le propriétaire d'une ligne ne change jamais : pas de userId dans un .set({…}) (ADR 0014).
const USER_ID_SET_SYNTAX = [
  {
    selector:
      "CallExpression[callee.property.name='set'] > ObjectExpression > Property[key.name='userId']",
    message:
      "Jamais userId dans un set : le propriétaire d'une ligne ne change pas (ADR 0014).",
  },
];
const USER_ID_ALL_SYNTAX = [
  ...USER_ID_SYNTAX,
  ...USER_ID_BRAND_SYNTAX,
  ...USER_ID_SET_SYNTAX,
];

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
      // Journaux : uniquement via @/lib/logger (JSON, masqué, signalé à Sentry) ; plan P0-06, D16.
      "no-console": "error",
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
        ...ENV_SYNTAX,
        ...SENTRY_SYNTAX,
        ...USER_ID_ALL_SYNTAX,
      ],
      "no-restricted-imports": [
        "error",
        { paths: ENV_IMPORT_PATHS, patterns: [CN_PATTERN, SENTRY_PATTERN] },
      ],
    },
  },
  // Kit de test (src/test/**) : peut fabriquer des UserId (comptes de test créés en base).
  {
    files: ["src/test/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...ENV_SYNTAX, ...SENTRY_SYNTAX],
    },
  },
  // Code livré de src/ : accès aux données interdit hors des fichiers autorisés (ADR 0014), harnais
  // de tests interdit, any non typé interdit dans les arguments et affectations (un req.json()
  // passé tel quel à une requête). Les blocs plus précis qui suivent reprennent ces interdits.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.{ts,tsx}",
      "src/test/**",
      "src/lib/env.ts",
      "src/lib/db/**",
      "src/lib/auth/index.ts",
      "src/lib/auth/config.ts",
      "src/features/*/repo.ts",
      "src/features/*/queries.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "no-restricted-syntax": [
        "error",
        ...ENV_SYNTAX,
        ...SENTRY_SYNTAX,
        ...USER_ID_ALL_SYNTAX,
        ...DATA_ACCESS_SYNTAX,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [
            CN_PATTERN,
            SENTRY_PATTERN,
            DATA_ACCESS_PATTERN,
            TEST_IMPORT_PATTERN,
          ],
        },
      ],
    },
  },
  // Fichiers autorisés à accéder aux données : mêmes interdits, sauf la base.
  {
    files: [
      "src/lib/db/**/*.ts",
      "src/lib/auth/index.ts",
      "src/lib/auth/config.ts",
      "src/features/*/repo.ts",
      "src/features/*/queries.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [CN_PATTERN, SENTRY_PATTERN, TEST_IMPORT_PATTERN],
        },
      ],
    },
  },
  // Seul fabricant de UserId : la marque Zod y est permise.
  {
    files: ["src/lib/auth/access.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENV_SYNTAX,
        ...SENTRY_SYNTAX,
        ...USER_ID_SYNTAX,
        ...USER_ID_SET_SYNTAX,
        ...DATA_ACCESS_SYNTAX,
      ],
    },
  },
  // src/lib/env.ts lit process.env (seul autorisé) mais n'importe pas Sentry.
  {
    files: ["src/lib/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...SENTRY_SYNTAX,
        ...USER_ID_ALL_SYNTAX,
        ...DATA_ACCESS_SYNTAX,
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            CN_PATTERN,
            SENTRY_PATTERN,
            DATA_ACCESS_PATTERN,
            TEST_IMPORT_PATTERN,
          ],
        },
      ],
    },
  },
  // Seul point d'import du paquet cn (garde l'interdit de process.env).
  {
    files: ["src/lib/utils.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [SENTRY_PATTERN, DATA_ACCESS_PATTERN, TEST_IMPORT_PATTERN],
        },
      ],
    },
  },
  // Points d'intégration Sentry côté serveur, et tests (mocks) : @sentry/* autorisé. En flat
  // config, redéclarer no-restricted-syntax remplace la règle : l'interdit de process.env est repris.
  {
    files: [
      "src/instrumentation.ts",
      "src/sentry.server.config.ts",
      "src/lib/logger/index.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENV_SYNTAX,
        ...USER_ID_ALL_SYNTAX,
        ...DATA_ACCESS_SYNTAX,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [CN_PATTERN, DATA_ACCESS_PATTERN, TEST_IMPORT_PATTERN],
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...ENV_SYNTAX],
      "no-restricted-imports": [
        "error",
        { paths: ENV_IMPORT_PATHS, patterns: [CN_PATTERN] },
      ],
    },
  },
  // Code exécuté dans le navigateur ou partagé avec lui (plan P0-06) : src/lib/env.ts est réservé
  // au serveur ; le navigateur lit sa configuration par public-config.ts (compiler.define).
  // Points d'intégration Sentry côté navigateur ou isomorphes : @sentry/* autorisé.
  {
    files: [
      "src/instrumentation-client.ts",
      "src/app/global-error.tsx",
      "src/lib/observability/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENV_SYNTAX,
        ...USER_ID_ALL_SYNTAX,
        ...DATA_ACCESS_SYNTAX,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [CN_PATTERN, SERVER_ONLY_PATTERN],
        },
      ],
    },
  },
  // Authentification côté navigateur (P1-02) : ni le serveur, ni lib/auth hors du client. Dans
  // src/lib/auth/client.ts, un import relatif (./config, ./index…) viserait aussi le serveur.
  ...[
    {
      files: ["src/features/auth/components/**"],
      extra: [],
    },
    {
      files: ["src/lib/auth/client.ts"],
      extra: [
        {
          regex: "^\\./",
          message:
            "src/lib/auth/client.ts : aucun import relatif (config, session et instance lisent la base et les secrets).",
        },
      ],
    },
  ].map(({ files, extra }) => ({
    files,
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...ENV_SYNTAX,
        ...USER_ID_ALL_SYNTAX,
        ...DATA_ACCESS_SYNTAX,
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [
            CN_PATTERN,
            SENTRY_PATTERN,
            SERVER_ONLY_PATTERN,
            {
              regex: "(^|/)lib/auth(/(?!client$).*)?$",
              message:
                "Code client : seul @/lib/auth/client est importable (config, session et instance lisent la base et les secrets).",
            },
            ...extra,
          ],
        },
      ],
    },
  })),
  {
    files: [
      "src/lib/logger/redact.ts",
      "src/lib/logger/serialize-error.ts",
      "src/lib/logger/logger.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ENV_IMPORT_PATHS,
          patterns: [CN_PATTERN, SENTRY_PATTERN, SERVER_ONLY_PATTERN],
        },
      ],
    },
  },
  // Thème verrouillé (plan P0-05, .claude/rules/ui.md) : seules les classes générées depuis
  // src/app/globals.css (donc depuis docs/design/tokens.json) sont admises ; aucune couleur
  // arbitraire, aucun dark: avant M3. Sont analysés : className, cn(), cva()… (sélecteurs par
  // défaut) et les valeurs des tables de classes nommées CLASSES_* (convention du projet).
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: {
      "better-tailwindcss": {
        entryPoint: "src/app/globals.css",
        selectors: [
          ...getDefaultSelectors(),
          {
            kind: "variable",
            name: "^CLASSES_[A-Z0-9_]+$",
            match: [{ type: "objectValues" }],
          },
        ],
      },
    },
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
            {
              pattern: "^dark:",
              message:
                "Pas de thème sombre avant le lancement (M3) : retirer les classes dark:.",
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
