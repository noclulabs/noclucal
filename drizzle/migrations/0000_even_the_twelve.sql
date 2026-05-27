CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "noclucal_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" "citext" NOT NULL,
	"display_name" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
