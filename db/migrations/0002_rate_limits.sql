CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_key_check" CHECK ("rate_limits"."key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rate_limits_count_check" CHECK ("rate_limits"."count" >= 1)
);
--> statement-breakpoint
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");