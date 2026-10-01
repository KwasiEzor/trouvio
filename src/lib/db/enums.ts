/**
 * Valeurs partagées par le schéma Drizzle (db/schema.ts, pgEnum et checks) et par les schémas
 * Zod. Aucune dépendance à Drizzle ni à pg : importable partout, y compris côté client.
 * Codes en anglais ; les libellés français vivent dans l'interface (plan P1-01, Q9).
 */

export const USER_ROLES = ["user", "admin"] as const;
// Gratuit, Économique, Confort (PRD §4).
export const PLANS = ["free", "economy", "comfort"] as const;
// Mêmes identifiants que JobSource.id (ARCHITECTURE §4).
export const JOB_SOURCES = ["france-travail", "forem", "adzuna"] as const;
export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export const CONTRACT_TYPES = [
  "permanent",
  "fixed_term",
  "freelance",
  "temporary",
  "internship",
  "apprenticeship",
  "other",
] as const;
export const DIGEST_FREQUENCIES = ["daily", "weekdays", "weekly"] as const;
export const SCORE_STATUSES = ["scored", "unscored"] as const;
export const FEEDBACK_VERDICTS = ["not_relevant", "relevant"] as const;
export const APPLICATION_STATUSES = [
  "to_review",
  "applied",
  "follow_up",
  "closed",
] as const;
export const DELIVERY_CHANNELS = ["telegram", "email"] as const;
export const DELIVERY_STATUSES = ["pending", "sent", "failed"] as const;
export const JOB_RUN_KINDS = ["daily"] as const;
export const JOB_RUN_STATUSES = [
  "running",
  "succeeded",
  "partial",
  "failed",
] as const;

/** Bornes du profil de recherche, identiques dans les checks SQL et dans Zod. */
export const PROFILE_BOUNDS = {
  threshold: { min: 0, max: 100, default: 60 },
  sendHour: { min: 0, max: 23, default: 7 },
  yearsExp: { min: 0, max: 60 },
  listMax: 50,
} as const;

/** Nombre maximal d'offres dans un digest (ARCHITECTURE §6). */
export const DIGEST_MAX_OFFERS = 10;
