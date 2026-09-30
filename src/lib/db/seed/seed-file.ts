import { z } from "zod";

import { searchProfileSchema } from "@/features/profile/core/search-profile";

import { PLANS, USER_ROLES } from "../enums";

/**
 * Fichier de seed (db/seed.local.json, hors dépôt ; db/seed.example.json, fictif). Le fichier
 * local contient des données personnelles (profil, prétentions salariales) : les erreurs ne
 * citent que des chemins et des codes Zod, jamais une valeur.
 */

const MAX_USERS = 20;

const seedUserSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(100),
  role: z.enum(USER_ROLES).default("user"),
  plan: z.enum(PLANS).default("free"),
  profile: searchProfileSchema,
});

export const seedFileSchema = z
  .strictObject({ users: z.array(seedUserSchema).min(1).max(MAX_USERS) })
  .superRefine(({ users }, ctx) => {
    const seen = new Set<string>();
    users.forEach(({ email }, index) => {
      if (seen.has(email)) {
        ctx.addIssue({
          code: "custom",
          path: ["users", index, "email"],
          message: "email en double",
        });
      }
      seen.add(email);
    });
  });

export type SeedFile = z.output<typeof seedFileSchema>;
export type SeedUser = SeedFile["users"][number];

export class SeedFileError extends Error {
  override readonly name = "SeedFileError";
  readonly paths: readonly string[];

  constructor(detail: string, paths: readonly string[] = []) {
    super(`Seed invalide : ${detail}.`);
    this.paths = paths;
  }
}

/** Analyse le texte du fichier ; le message de JSON.parse, qui cite le contenu, n'est pas repris. */
export function parseSeedText(text: string): SeedFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SeedFileError("JSON illisible");
  }
  const result = seedFileSchema.safeParse(json);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
  }));
  throw new SeedFileError(
    issues
      .map(({ path, code }) => `${path || "(racine)"} (${code})`)
      .join(", "),
    issues.map(({ path }) => path),
  );
}
