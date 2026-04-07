import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const skillProgress = pgTable(
  "skill_progress",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    unique("skill_progress_user_skill_unique").on(table.userId, table.skillId),
    index("skill_progress_user_id_idx").on(table.userId),
    index("skill_progress_skill_id_idx").on(table.skillId),
  ],
);

export const skillProgressRelations = relations(skillProgress, ({ one }) => ({
  user: one(user, {
    fields: [skillProgress.userId],
    references: [user.id],
  }),
}));
