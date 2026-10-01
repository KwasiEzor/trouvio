import { defineConfig } from "drizzle-kit";

// drizzle-kit ne sert qu'à generate et check, qui ne se connectent à aucune base : aucune
// variable ni aucun identifiant ici. Les migrations versionnées sont appliquées par
// pnpm db:migrate (src/lib/db/migrate.ts), jamais poussées directement par drizzle-kit.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  strict: true,
  verbose: true,
});
