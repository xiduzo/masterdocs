import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { isValidSlug } from "../lib/mdx";
import {
  ContentAlreadyExistsError,
  ContentMergeConflictError,
  ContentNotFoundError,
} from "../lib/octokit-content-repository";

/**
 * Admin-only procedure — extends protectedProcedure with a role check.
 * Throws FORBIDDEN if the authenticated user does not have the "admin" role.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

export const contentRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.contentRepository.listContent();
  }),

  listPending: adminProcedure.query(async ({ ctx }) => {
    return ctx.contentRepository.listPendingSubmissions();
  }),

  get: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        track: z.string().optional(),
        slug: z.string(),
        fromBranch: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.contentRepository.getTopic({
          roadmap: input.roadmap,
          slug: input.slug,
          track: input.track,
        });
      } catch (err) {
        if (err instanceof ContentNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  submit: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        track: z.string().optional(),
        slug: z.string(),
        frontmatter: z.object({
          title: z.string().min(1),
          description: z.string().optional(),
        }),
        body: z.string(),
        fileSha: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.contentRepository.submitTopicEdit({
        coords: { roadmap: input.roadmap, slug: input.slug, track: input.track },
        frontmatter: input.frontmatter,
        body: input.body,
        fileSha: input.fileSha,
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        slug: z.string(),
        track: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isValidSlug(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }
      try {
        return await ctx.contentRepository.createTopic({
          roadmap: input.roadmap,
          slug: input.slug,
          track: input.track,
        });
      } catch (err) {
        if (err instanceof ContentAlreadyExistsError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),

  publish: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.contentRepository.publishTopic(input.prNumber);
      } catch (err) {
        if (err instanceof ContentMergeConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
      return { success: true };
    }),

  discard: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.contentRepository.discardTopic(input.prNumber);
      return { success: true };
    }),

  checkConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .query(async ({ ctx, input }) => {
      return ctx.contentRepository.checkConflict(input.prNumber);
    }),

  keepMineOnConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.contentRepository.keepMineOnConflict(input.prNumber);
      return { success: true };
    }),

  useMainOnConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.contentRepository.useMainOnConflict(input.prNumber);
      return { success: true };
    }),

  submitMergedContent: adminProcedure
    .input(
      z.object({
        prNumber: z.number(),
        frontmatter: z.object({
          title: z.string().min(1),
          description: z.string().optional(),
        }),
        body: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.contentRepository.submitMergedContent({
        prNumber: input.prNumber,
        frontmatter: input.frontmatter,
        body: input.body,
      });
      return { success: true };
    }),

  /** Create an entirely new roadmap (directory + scaffolding files). */
  createRoadmap: adminProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isValidSlug(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }
      try {
        return await ctx.contentRepository.createRoadmap(input);
      } catch (err) {
        if (err instanceof ContentAlreadyExistsError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),

  /** Create a new track (sub-section) inside a roadmap. */
  createTrack: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        trackSlug: z.string(),
        trackTitle: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isValidSlug(input.trackSlug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }
      try {
        return await ctx.contentRepository.createTrack(input);
      } catch (err) {
        if (err instanceof ContentAlreadyExistsError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),

  deleteFile: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        track: z.string().optional(),
        slug: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.slug === "index") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'The "index" page cannot be deleted directly. Delete the track or roadmap instead.',
        });
      }
      try {
        await ctx.contentRepository.deleteTopic({
          roadmap: input.roadmap,
          slug: input.slug,
          track: input.track,
        });
        return { success: true };
      } catch (err) {
        if (err instanceof ContentNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  deleteTrack: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        track: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { deletedFiles } = await ctx.contentRepository.deleteTrack({
          roadmap: input.roadmap,
          trackSlug: input.track,
        });
        return { success: true, deletedFiles };
      } catch (err) {
        if (err instanceof ContentNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  deleteRoadmap: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { deletedFiles } = await ctx.contentRepository.deleteRoadmap(
          input.roadmap,
        );
        return { success: true, deletedFiles };
      } catch (err) {
        if (err instanceof ContentNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /**
   * Reorder Tracks and/or Topics within a Roadmap. The flat `items`
   * payload comes from the admin DnD UI; this procedure dispatches it
   * into the repo's two reorder verbs.
   */
  reorder: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        items: z.array(
          z.object({
            slug: z.string(),
            track: z.string().optional(),
            trackOrder: z.number().optional(),
            topicOrder: z.number().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invalidIndexItem = input.items.find(
        (item) => item.slug === "index" || item.track === "index",
      );
      if (invalidIndexItem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'The "index" item cannot be reordered and must stay first.',
        });
      }

      // Group items: track-order signals (per-track) and topic-order signals (per track).
      const topicsByTrack = new Map<string, { slug: string; topicOrder: number }[]>();
      const trackOrderByTrack = new Map<string, number>();

      for (const item of input.items) {
        if (!item.track) continue;
        if (item.topicOrder !== undefined) {
          const bucket = topicsByTrack.get(item.track) ?? [];
          bucket.push({ slug: item.slug, topicOrder: item.topicOrder });
          topicsByTrack.set(item.track, bucket);
        }
        if (item.trackOrder !== undefined) {
          trackOrderByTrack.set(item.track, item.trackOrder);
        }
      }

      const repo = ctx.contentRepository;

      for (const [trackSlug, topics] of topicsByTrack) {
        const orderedTopicSlugs = topics
          .sort((a, b) => a.topicOrder - b.topicOrder)
          .map((t) => t.slug);
        await repo.reorderTopicsInTrack({
          roadmap: input.roadmap,
          trackSlug,
          orderedTopicSlugs,
        });
      }

      if (trackOrderByTrack.size > 0) {
        const orderedTrackSlugs = [...trackOrderByTrack.entries()]
          .sort(([, a], [, b]) => a - b)
          .map(([slug]) => slug);
        await repo.reorderTracksInRoadmap({
          roadmap: input.roadmap,
          orderedTrackSlugs,
        });
      }

      return { success: true };
    }),
});
