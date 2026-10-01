CREATE TYPE "public"."application_status" AS ENUM('to_review', 'applied', 'follow_up', 'closed');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('permanent', 'fixed_term', 'freelance', 'temporary', 'internship', 'apprenticeship', 'other');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('telegram', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."digest_frequency" AS ENUM('daily', 'weekdays', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."feedback_verdict" AS ENUM('not_relevant', 'relevant');--> statement-breakpoint
CREATE TYPE "public"."job_run_kind" AS ENUM('daily');--> statement-breakpoint
CREATE TYPE "public"."job_run_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('france-travail', 'forem', 'adzuna');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'economy', 'comfort');--> statement-breakpoint
CREATE TYPE "public"."score_status" AS ENUM('scored', 'unscored');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'to_review' NOT NULL,
	"applied_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_user_id_offer_id_unique" UNIQUE("user_id","offer_id")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"digest_date" date NOT NULL,
	"offer_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "deliveries_user_id_channel_digest_date_unique" UNIQUE("user_id","channel","digest_date"),
	CONSTRAINT "deliveries_offer_ids_check" CHECK (cardinality("deliveries"."offer_ids") <= 10)
);
--> statement-breakpoint
CREATE TABLE "job_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "job_source" NOT NULL,
	"external_id" text NOT NULL,
	"dedup_hash" text NOT NULL,
	"canonical_offer_id" uuid,
	"title" text NOT NULL,
	"company" text,
	"location" text,
	"contract" "contract_type",
	"salary_min" integer,
	"salary_max" integer,
	"remote" "work_mode",
	"description" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_offers_source_external_id_unique" UNIQUE("source","external_id"),
	CONSTRAINT "job_offers_not_own_canonical_check" CHECK ("job_offers"."canonical_offer_id" <> "job_offers"."id"),
	CONSTRAINT "job_offers_dedup_hash_check" CHECK ("job_offers"."dedup_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "job_offers_salary_check" CHECK ("job_offers"."salary_min" >= 0 and "job_offers"."salary_max" >= 0 and "job_offers"."salary_min" <= "job_offers"."salary_max"),
	CONSTRAINT "job_offers_url_check" CHECK ("job_offers"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "job_run_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "job_run_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "job_runs_finished_after_started_check" CHECK ("job_runs"."finished_at" >= "job_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "offer_feedback" (
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"verdict" "feedback_verdict" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_feedback_pk" PRIMARY KEY("user_id","offer_id")
);
--> statement-breakpoint
CREATE TABLE "offer_scores" (
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"score" smallint,
	"strengths" text[] DEFAULT '{}' NOT NULL,
	"concerns" text[] DEFAULT '{}' NOT NULL,
	"reason" text,
	"status" "score_status" NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_scores_pk" PRIMARY KEY("user_id","offer_id"),
	CONSTRAINT "offer_scores_score_check" CHECK ("offer_scores"."score" between 0 and 100),
	CONSTRAINT "offer_scores_status_check" CHECK (("offer_scores"."status" = 'scored') = ("offer_scores"."score" is not null)),
	CONSTRAINT "offer_scores_usage_check" CHECK ("offer_scores"."input_tokens" >= 0 and "offer_scores"."output_tokens" >= 0 and "offer_scores"."cost_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "search_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"titles" text[] DEFAULT '{}' NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"years_exp" smallint,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"zone" text NOT NULL,
	"remote_modes" "work_mode"[] DEFAULT '{onsite,hybrid,remote}' NOT NULL,
	"contracts" "contract_type"[] DEFAULT '{}' NOT NULL,
	"min_salary" integer,
	"excluded_keywords" text[] DEFAULT '{}' NOT NULL,
	"excluded_companies" text[] DEFAULT '{}' NOT NULL,
	"threshold" smallint DEFAULT 60 NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"send_hour" smallint DEFAULT 7 NOT NULL,
	"frequency" "digest_frequency" DEFAULT 'daily' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_profiles_threshold_check" CHECK ("search_profiles"."threshold" between 0 and 100),
	CONSTRAINT "search_profiles_send_hour_check" CHECK ("search_profiles"."send_hour" between 0 and 23),
	CONSTRAINT "search_profiles_years_exp_check" CHECK ("search_profiles"."years_exp" between 0 and 60),
	CONSTRAINT "search_profiles_min_salary_check" CHECK ("search_profiles"."min_salary" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_offer_id_job_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."job_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_canonical_offer_id_fk" FOREIGN KEY ("canonical_offer_id") REFERENCES "public"."job_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_feedback" ADD CONSTRAINT "offer_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_feedback" ADD CONSTRAINT "offer_feedback_offer_id_job_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."job_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_scores" ADD CONSTRAINT "offer_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_scores" ADD CONSTRAINT "offer_scores_offer_id_job_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."job_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_profiles" ADD CONSTRAINT "search_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_offer_id_idx" ON "applications" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "job_offers_dedup_hash_idx" ON "job_offers" USING btree ("dedup_hash");--> statement-breakpoint
CREATE INDEX "job_offers_canonical_offer_id_idx" ON "job_offers" USING btree ("canonical_offer_id") WHERE "job_offers"."canonical_offer_id" is not null;--> statement-breakpoint
CREATE INDEX "job_offers_canonical_published_at_idx" ON "job_offers" USING btree ("published_at" DESC NULLS LAST) WHERE "job_offers"."canonical_offer_id" is null;--> statement-breakpoint
CREATE INDEX "job_runs_last_succeeded_idx" ON "job_runs" USING btree ("kind","started_at" DESC NULLS LAST) WHERE "job_runs"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "offer_feedback_offer_id_idx" ON "offer_feedback" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offer_scores_offer_id_idx" ON "offer_scores" USING btree ("offer_id");