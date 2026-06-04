CREATE TABLE "availability_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_available" boolean NOT NULL,
	"start_time" time,
	"end_time" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_overrides_shape" CHECK (("availability_overrides"."is_available" = false AND "availability_overrides"."start_time" IS NULL AND "availability_overrides"."end_time" IS NULL) OR ("availability_overrides"."is_available" = true AND "availability_overrides"."start_time" IS NOT NULL AND "availability_overrides"."end_time" IS NOT NULL AND "availability_overrides"."start_time" < "availability_overrides"."end_time"))
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_weekday_range" CHECK ("availability_rules"."weekday" between 1 and 7),
	CONSTRAINT "availability_rules_time_order" CHECK ("availability_rules"."start_time" < "availability_rules"."end_time")
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 0 NOT NULL,
	"max_future_minutes" integer DEFAULT 86400 NOT NULL,
	"slot_granularity_minutes" integer DEFAULT 15 NOT NULL,
	"color" varchar(32) DEFAULT 'indigo' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_user_id_noclucal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."noclucal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_user_id_noclucal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."noclucal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_user_id_noclucal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."noclucal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_settings" ADD CONSTRAINT "host_settings_user_id_noclucal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."noclucal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_overrides_user_idx" ON "availability_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "availability_overrides_user_date_idx" ON "availability_overrides" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "availability_rules_user_idx" ON "availability_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "availability_rules_user_weekday_idx" ON "availability_rules" USING btree ("user_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "event_types_user_slug_unique" ON "event_types" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "event_types_user_idx" ON "event_types" USING btree ("user_id");