import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { protectedProcedure, router } from "../index";
import { db } from "@fumadocs-learning/db";
import { skillProgress } from "@fumadocs-learning/db/schema/skill-progress";

export const progressRouter = router({
  toggleSkill: protectedProcedure
    .input(
      z.object({
        skillId: z.string(),
        completed: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.completed) {
        // Insert with ON CONFLICT DO NOTHING for idempotency
        await db
          .insert(skillProgress)
          .values({
            userId,
            skillId: input.skillId,
          })
          .onConflictDoNothing({
            target: [skillProgress.userId, skillProgress.skillId],
          });
      } else {
        // Delete the record
        await db
          .delete(skillProgress)
          .where(
            and(
              eq(skillProgress.userId, userId),
              eq(skillProgress.skillId, input.skillId),
            ),
          );
      }

      return { success: true };
    }),

  getByRoadmap: protectedProcedure
    .input(
      z.object({
        roadmapSlug: z.string(),
      }),
    )
    .query(async ({ ctx, input: _input }) => {
      const userId = ctx.session.user.id;

      // TODO: Filter by roadmap-scoped skill IDs — will be wired up in Task 13.
      // For now, return all progress records for the user.
      const records = await db.query.skillProgress.findMany({
        where: eq(skillProgress.userId, userId),
      });

      return {
        records: records.map((r) => ({
          skillId: r.skillId,
          completedAt: r.completedAt,
        })),
      };
    }),

  getSummary: protectedProcedure
    .input(
      z.object({
        roadmapSlug: z.string(),
      }),
    )
    .query(async ({ ctx, input: _input }) => {
      const userId = ctx.session.user.id;

      // TODO: Resolve roadmap structure and compute per-track counts — will be wired up in Task 13.
      // For now, return empty tracks and an overall count of all user progress records.
      const records = await db.query.skillProgress.findMany({
        where: eq(skillProgress.userId, userId),
      });

      return {
        tracks: [] as Array<{
          trackSlug: string;
          completed: number;
          total: number;
        }>,
        overall: {
          completed: records.length,
          total: 0,
        },
      };
    }),
});
