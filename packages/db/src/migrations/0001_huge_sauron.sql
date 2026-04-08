CREATE TABLE "change_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_path" text NOT NULL,
	"branch_name" text NOT NULL,
	"pr_number" integer NOT NULL,
	"base_commit_sha" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_records_user_id_idx" ON "change_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "change_records_file_path_idx" ON "change_records" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "change_records_status_idx" ON "change_records" USING btree ("status");