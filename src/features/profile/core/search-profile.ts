import { z } from "zod";

import {
  CONTRACT_TYPES,
  DIGEST_FREQUENCIES,
  PROFILE_BOUNDS,
  WORK_MODES,
} from "@/lib/db/enums";

/**
 * Profil de recherche d'un utilisateur (table search_profiles). Bornes identiques aux checks SQL
 * de db/schema.ts. Sert au seed (P1-01) et au formulaire de profil (P6-05).
 */

const { threshold, sendHour, yearsExp, listMax } = PROFILE_BOUNDS;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** Liste sans doublons, plafonnée avant dédoublonnage. */
const list = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).max(listMax).transform(unique);

const text = () => z.string().trim().min(1).max(200);
const int = (min: number, max: number) => z.int().min(min).max(max);

const channel = z.strictObject({ enabled: z.boolean() });

export const searchProfileSchema = z.strictObject({
  titles: list(text()).pipe(z.array(z.string()).min(1)),
  skills: list(text()).default([]),
  yearsExp: int(yearsExp.min, yearsExp.max).optional(),
  // Codes ISO 639-1 (fr, en, nl…).
  languages: list(z.string().regex(/^[a-z]{2}$/)).default([]),
  // Texte libre (« Namur ») ; format affiné par P2-00 à P2-05.
  zone: text(),
  remoteModes: list(z.enum(WORK_MODES))
    .pipe(z.array(z.enum(WORK_MODES)).min(1))
    .default([...WORK_MODES]),
  // Vide = tous les contrats.
  contracts: list(z.enum(CONTRACT_TYPES)).default([]),
  // Salaire brut annuel minimal, en euros.
  minSalary: int(0, 1_000_000).optional(),
  excludedKeywords: list(text()).default([]),
  excludedCompanies: list(text()).default([]),
  threshold: int(threshold.min, threshold.max).default(threshold.default),
  channels: z
    .strictObject({ telegram: channel.optional(), email: channel.optional() })
    .default({}),
  // Heure locale Europe/Brussels.
  sendHour: int(sendHour.min, sendHour.max).default(sendHour.default),
  frequency: z.enum(DIGEST_FREQUENCIES).default("daily"),
});

export type SearchProfileInput = z.input<typeof searchProfileSchema>;
export type SearchProfile = z.output<typeof searchProfileSchema>;
