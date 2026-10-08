import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Trois projets : *.test.ts en environnement node (logique, lib, harnais MSW), *.test.tsx en
// jsdom avec Testing Library (composants), *.db.test.ts sur un vrai Postgres local (projet db,
// base Docker de pnpm db:local:up ou service de la CI). Tests colocalisés, globals désactivés.
// Les Server Components async et les parcours complets se testent en E2E (Playwright, tests/e2e).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Aucun journal pendant les tests ; un test qui vérifie des journaux injecte sa propre sortie.
    env: { LOG_LEVEL: "silent" },
    coverage: {
      provider: "v8",
      // Compte aussi les fichiers jamais chargés par un test.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "src/test/**",
        "**/__fixtures__/**",
        "**/*.d.ts",
        // Pure configuration (createAuthClient) : le client est un Proxy qui répond à tout chemin,
        // un test unitaire n'y prouverait rien. Couvert par l'E2E tests/e2e/auth.spec.ts.
        "src/lib/auth/client.ts",
      ],
      reporter: ["text", "html"],
      // docs/TESTING.md : 80 % pour chaque fichier de lib/ et de la logique pure des domaines.
      // Un fichier de pure configuration s'exclut explicitement (commentaire justifié), jamais par baisse du seuil.
      thresholds: {
        "src/lib/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
          perFile: true,
        },
        "src/features/*/core/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
          perFile: true,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          setupFiles: ["./src/test/setup.ts"],
          // Base modèle migrée une fois, clonée par chaque fichier (src/test/db/test-database.ts).
          globalSetup: ["./src/test/db/global-setup.ts"],
          // Une base à la fois : un clone exige qu'aucune session ne soit ouverte sur le modèle.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts", "./src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
