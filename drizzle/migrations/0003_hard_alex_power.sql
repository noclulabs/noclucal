CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_type_id" uuid,
	"host_user_id" uuid NOT NULL,
	"event_type_name" varchar(200) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"invitee_name" varchar(200) NOT NULL,
	"invitee_email" varchar(320) NOT NULL,
	"invitee_note" text,
	"invitee_timezone" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'confirmed' NOT NULL,
	"google_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap_per_host"
  EXCLUDE USING gist (
    "host_user_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" = 'confirmed');--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_noclucal_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."noclucal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_host_idx" ON "bookings" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "bookings_host_starts_idx" ON "bookings" USING btree ("host_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_event_type_idx" ON "bookings" USING btree ("event_type_id");