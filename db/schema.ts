import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type { SearchProfile } from "../src/features/profile/core/search-profile";
import {
  APPLICATION_STATUSES,
  CONTRACT_TYPES,
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  DIGEST_FREQUENCIES,
  DIGEST_MAX_OFFERS,
  FEEDBACK_VERDICTS,
  JOB_RUN_KINDS,
  JOB_RUN_STATUSES,
  JOB_SOURCES,
  PLANS,
  PROFILE_BOUNDS,
  SCORE_STATUSES,
  USER_ROLES,
  WORK_MODES,
} from "../src/lib/db/enums";

/**
 * Schéma unique de Trouvio (ARCHITECTURE §5, .claude/rules/db.md). Noms SQL explicites en
 * snake_case. Toute table à user_id référence users en cascade (suppression de compte) et
 * commence une clé ou un index par user_id (src/lib/db/schema.test.ts). Tables de session de
 * Better Auth : ajoutées en P1-02.
 */

// ---------------------------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------------------------

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
// $onUpdate ne couvre pas le set d'un onConflictDoUpdate : l'y poser explicitement.
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => uuid("id").primaryKey().defaultRandom();
const emptyArray = sql`'{}'`;

/** Nombre littéral dans un check (un paramètre $1 n'a pas de sens dans du DDL). */
const n = (value: number): SQL => sql.raw(String(value));
const between = (column: AnyPgColumn, min: number, max: number): SQL =>
  sql`${column} between ${n(min)} and ${n(max)}`;

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

export const userRole = pgEnum("user_role", USER_ROLES);
export const plan = pgEnum("plan", PLANS);
export const jobSource = pgEnum("job_source", JOB_SOURCES);
export const workMode = pgEnum("work_mode", WORK_MODES);
export const contractType = pgEnum("contract_type", CONTRACT_TYPES);
export const digestFrequency = pgEnum("digest_frequency", DIGEST_FREQUENCIES);
export const scoreStatus = pgEnum("score_status", SCORE_STATUSES);
export const feedbackVerdict = pgEnum("feedback_verdict", FEEDBACK_VERDICTS);
export const applicationStatus = pgEnum(
  "application_status",
  APPLICATION_STATUSES,
);
export const deliveryChannel = pgEnum("delivery_channel", DELIVERY_CHANNELS);
export const deliveryStatus = pgEnum("delivery_status", DELIVERY_STATUSES);
export const jobRunKind = pgEnum("job_run_kind", JOB_RUN_KINDS);
export const jobRunStatus = pgEnum("job_run_status", JOB_RUN_STATUSES);

// ---------------------------------------------------------------------------------------------
// Utilisateurs et profils
// ---------------------------------------------------------------------------------------------

/** Table utilisateur de Better Auth (modelName « users » en P1-02). */
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull().default("user"),
    plan: plan("plan").notNull().default("free"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("users_email_unique").on(t.email),
    check("users_email_lowercase_check", sql`${t.email} = lower(${t.email})`),
  ],
);

const { threshold, sendHour, yearsExp } = PROFILE_BOUNDS;

export const searchProfiles = pgTable(
  "search_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    titles: text("titles").array().notNull().default(emptyArray),
    skills: text("skills").array().notNull().default(emptyArray),
    yearsExp: smallint("years_exp"),
    languages: text("languages").array().notNull().default(emptyArray),
    zone: text("zone").notNull(),
    remoteModes: workMode("remote_modes")
      .array()
      .notNull()
      .default(sql`'{onsite,hybrid,remote}'`),
    // Vide = tous les contrats.
    contracts: contractType("contracts").array().notNull().default(emptyArray),
    // Salaire brut annuel minimal, en euros.
    minSalary: integer("min_salary"),
    excludedKeywords: text("excluded_keywords")
      .array()
      .notNull()
      .default(emptyArray),
    excludedCompanies: text("excluded_companies")
      .array()
      .notNull()
      .default(emptyArray),
    threshold: smallint("threshold").notNull().default(threshold.default),
    channels: jsonb("channels")
      .$type<SearchProfile["channels"]>()
      .notNull()
      .default({}),
    // Heure locale Europe/Brussels.
    sendHour: smallint("send_hour").notNull().default(sendHour.default),
    frequency: digestFrequency("frequency").notNull().default("daily"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "search_profiles_threshold_check",
      between(t.threshold, threshold.min, threshold.max),
    ),
    check(
      "search_profiles_send_hour_check",
      between(t.sendHour, sendHour.min, sendHour.max),
    ),
    check(
      "search_profiles_years_exp_check",
      between(t.yearsExp, yearsExp.min, yearsExp.max),
    ),
    check("search_profiles_min_salary_check", sql`${t.minSalary} >= 0`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------------------------

export const jobOffers = pgTable(
  "job_offers",
  {
    id: id(),
    source: jobSource("source").notNull(),
    // Identifiant de l'offre chez la source : fait foi au sein d'une même source.
    externalId: text("external_id").notNull(),
    // sha256(norm(company) + norm(title) + norm(city)), comparé entre sources seulement.
    dedupHash: text("dedup_hash").notNull(),
    // null = offre canonique ; sinon doublon d'une offre d'une autre source.
    canonicalOfferId: uuid("canonical_offer_id"),
    title: text("title").notNull(),
    company: text("company"),
    location: text("location"),
    contract: contractType("contract"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    remote: workMode("remote"),
    description: text("description").notNull().default(""),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Réponse brute de la source : donnée non fiable, jamais rendue telle quelle.
    raw: jsonb("raw").$type<unknown>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("job_offers_source_external_id_unique").on(t.source, t.externalId),
    foreignKey({
      name: "job_offers_canonical_offer_id_fk",
      columns: [t.canonicalOfferId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    index("job_offers_dedup_hash_idx").on(t.dedupHash),
    index("job_offers_canonical_offer_id_idx")
      .on(t.canonicalOfferId)
      .where(sql`${t.canonicalOfferId} is not null`),
    // Le job ne lit que les offres canoniques, les plus récentes d'abord.
    index("job_offers_canonical_published_at_idx")
      .on(t.publishedAt.desc())
      .where(sql`${t.canonicalOfferId} is null`),
    check(
      "job_offers_not_own_canonical_check",
      sql`${t.canonicalOfferId} <> ${t.id}`,
    ),
    check(
      "job_offers_dedup_hash_check",
      sql`${t.dedupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "job_offers_salary_check",
      sql`${t.salaryMin} >= 0 and ${t.salaryMax} >= 0 and ${t.salaryMin} <= ${t.salaryMax}`,
    ),
    check("job_offers_url_check", sql`${t.url} ~ '^https?://'`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Scores, retours et candidatures (par utilisateur)
// ---------------------------------------------------------------------------------------------

export const offerScores = pgTable(
  "offer_scores",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => jobOffers.id, { onDelete: "cascade" }),
    score: smallint("score"),
    strengths: text("strengths").array().notNull().default(emptyArray),
    concerns: text("concerns").array().notNull().default(emptyArray),
    reason: text("reason"),
    status: scoreStatus("status").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // numeric : renvoyé en chaîne par pg.
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({
      name: "offer_scores_pk",
      columns: [t.userId, t.offerId],
    }),
    index("offer_scores_offer_id_idx").on(t.offerId),
    check("offer_scores_score_check", between(t.score, 0, 100)),
    check(
      "offer_scores_status_check",
      sql`(${t.status} = 'scored') = (${t.score} is not null)`,
    ),
    check(
      "offer_scores_usage_check",
      sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.costUsd} >= 0`,
    ),
  ],
);

export const offerFeedback = pgTable(
  "offer_feedback",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => jobOffers.id, { onDelete: "cascade" }),
    verdict: feedbackVerdict("verdict").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({
      name: "offer_feedback_pk",
      columns: [t.userId, t.offerId],
    }),
    index("offer_feedback_offer_id_idx").on(t.offerId),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // restrict : une purge des offres ne doit pas effacer l'historique des candidatures.
    offerId: uuid("offer_id")
      .notNull()
      .references(() => jobOffers.id, { onDelete: "restrict" }),
    status: applicationStatus("status").notNull().default("to_review"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("applications_user_id_offer_id_unique").on(t.userId, t.offerId),
    index("applications_offer_id_idx").on(t.offerId),
  ],
);

// ---------------------------------------------------------------------------------------------
// Envois et exécutions du job
// ---------------------------------------------------------------------------------------------

export const deliveries = pgTable(
  "deliveries",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: deliveryChannel("channel").notNull(),
    // Date du digest à Bruxelles.
    digestDate: date("digest_date", { mode: "string" }).notNull(),
    offerIds: uuid("offer_ids").array().notNull().default(emptyArray),
    status: deliveryStatus("status").notNull().default("pending"),
    // Code ou message nettoyé, sans donnée personnelle.
    error: text("error"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    unique("deliveries_user_id_channel_digest_date_unique").on(
      t.userId,
      t.channel,
      t.digestDate,
    ),
    check(
      "deliveries_offer_ids_check",
      sql`cardinality(${t.offerIds}) <= ${n(DIGEST_MAX_OFFERS)}`,
    ),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    kind: jobRunKind("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: jobRunStatus("status").notNull().default("running"),
    stats: jsonb("stats")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (t) => [
    // « Collecte depuis le dernier run réussi » (ARCHITECTURE §6).
    index("job_runs_last_succeeded_idx")
      .on(t.kind, t.startedAt.desc())
      .where(sql`${t.status} = 'succeeded'`),
    check(
      "job_runs_finished_after_started_check",
      sql`${t.finishedAt} >= ${t.startedAt}`,
    ),
  ],
);

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SearchProfileRow = typeof searchProfiles.$inferSelect;
export type NewSearchProfileRow = typeof searchProfiles.$inferInsert;
export type JobOffer = typeof jobOffers.$inferSelect;
export type NewJobOffer = typeof jobOffers.$inferInsert;
export type OfferScore = typeof offerScores.$inferSelect;
export type NewOfferScore = typeof offerScores.$inferInsert;
export type OfferFeedback = typeof offerFeedback.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
