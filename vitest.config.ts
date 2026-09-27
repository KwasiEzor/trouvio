import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest minimal (P0-02) : tests unitaires en environnement node.
// P0-03 ajoutera Testing Library, MSW, la couverture et un environnement DOM.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
