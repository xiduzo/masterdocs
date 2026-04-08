import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const changeRecords = pgTable(
  "change_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    branchName: text("branch_name").notNull(),
    prNumber: integer("pr_number").notNull(),
    baseCommitSha: text("base_commit_sha").notNull(),
    status: text("status", {
      enum: ["pending_review", "published", "discarded"],
    })
      .notNull()
      .default("pending_review"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("change_records_user_id_idx").on(table.userId),
    index("change_records_file_path_idx").on(table.filePath),
    index("change_records_status_idx").on(table.status),
  ],
);

export const changeRecordsRelations = relations(changeRecords, ({ one }) => ({
  user: one(user, {
    fields: [changeRecords.userId],
    references: [user.id],
  }),
}));
