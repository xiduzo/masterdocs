import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, publicProcedure, router } from "../index";
import { db } from "@fumadocs-learning/db";
import { skillProgress } from "@fumadocs-learning/db/schema/skill-progress";
import { getRoadmapContent } from "../lib/roadmap-content";

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
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Resolve roadmap structure from content files
      const roadmap = getRoadmapContent(input.roadmapSlug);
      if (!roadmap) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Roadmap "${input.roadmapSlug}" not found`,
        });
      }

      // Collect all skill IDs across all tracks/topics in this roadmap
      const allSkillIds = roadmap.tracks.flatMap((track) => track.skillIds);

      if (allSkillIds.length === 0) {
        return { records: [] };
      }

      // Fetch only progress records for skills within this roadmap
      const records = await db.query.skillProgress.findMany({
        where: and(
          eq(skillProgress.userId, userId),
          inArray(skillProgress.skillId, allSkillIds),
        ),
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
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Resolve roadmap structure from content files
      const roadmap = getRoadmapContent(input.roadmapSlug);
      if (!roadmap) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Roadmap "${input.roadmapSlug}" not found`,
        });
      }

      // Collect all skill IDs for the roadmap
      const allSkillIds = roadmap.tracks.flatMap((track) => track.skillIds);

      // Fetch completed skill records for this user within this roadmap
      let completedSkillIds: Set<string>;
      if (allSkillIds.length === 0) {
        completedSkillIds = new Set();
      } else {
        const records = await db.query.skillProgress.findMany({
          where: and(
            eq(skillProgress.userId, userId),
            inArray(skillProgress.skillId, allSkillIds),
          ),
        });
        completedSkillIds = new Set(records.map((r) => r.skillId));
      }

      // Compute per-track counts
      const tracks = roadmap.tracks.map((track) => ({
        trackSlug: track.slug,
        completed: track.skillIds.filter((id) => completedSkillIds.has(id)).length,
        total: track.skillIds.length,
      }));

      // Compute overall counts
      const overall = {
        completed: allSkillIds.filter((id) => completedSkillIds.has(id)).length,
        total: allSkillIds.length,
      };

      return { tracks, overall };
    }),

  /**
   * Bulk sync local progress after sign-in.
   * Accepts resolved choices from the client and applies them.
   */
  bulkSync: protectedProcedure
    .input(
      z.object({
        /** Skill IDs the user chose to mark as completed */
        completedIds: z.array(z.string()),
        /** Skill IDs the user chose to mark as not completed */
        uncompletedIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Insert completed skills (idempotent)
      if (input.completedIds.length > 0) {
        await db
          .insert(skillProgress)
          .values(
            input.completedIds.map((skillId) => ({
              userId,
              skillId,
            })),
          )
          .onConflictDoNothing({
            target: [skillProgress.userId, skillProgress.skillId],
          });
      }

      // Remove uncompleted skills
      if (input.uncompletedIds.length > 0) {
        await db
          .delete(skillProgress)
          .where(
            and(
              eq(skillProgress.userId, userId),
              inArray(skillProgress.skillId, input.uncompletedIds),
            ),
          );
      }

      return { success: true };
    }),

  /**
   * Fetch all completed skill IDs for the current user.
   * Used during sync to compare local vs server state.
   */
  getAllCompleted: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const records = await db.query.skillProgress.findMany({
      where: eq(skillProgress.userId, userId),
    });
    return { completedIds: records.map((r) => r.skillId) };
  }),

  /**
   * Public endpoint for RSC components to fetch skill completion states.
   * Returns auth status + completed skill IDs for the given set.
   * Unauthenticated users get isAuthenticated=false and empty completedIds.
   */
  getSkillStates: publicProcedure
    .input(
      z.object({
        skillIds: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.session?.user || input.skillIds.length === 0) {
        return {
          isAuthenticated: !!ctx.session?.user,
          completedIds: [] as string[],
        };
      }

      const records = await db.query.skillProgress.findMany({
        where: and(
          eq(skillProgress.userId, ctx.session.user.id),
          inArray(skillProgress.skillId, input.skillIds),
        ),
      });

      return {
        isAuthenticated: true,
        completedIds: records.map((r) => r.skillId),
      };
    }),
});
