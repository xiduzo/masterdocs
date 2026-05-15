import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { getCachedGitHubService } from "../lib/github-cache";
import { isValidSlug, parseMdx } from "../lib/mdx";
import {
  ContentAlreadyExistsError,
  ContentMergeConflictError,
  ContentNotFoundError,
  getContentRepository,
} from "../lib/octokit-content-repository";

// Deterministic branch name derived from content coordinates.
// filePath is fully recoverable from this, eliminating DB as source of truth.
function contentBranchName(roadmap: string, slug: string, track?: string): string {
  return track ? `content/${roadmap}/${track}/${slug}` : `content/${roadmap}/${slug}`;
}

// Reverse of contentBranchName → full GitHub file path.
function filePathFromBranch(branchName: string): string {
  const segments = branchName.slice("content/".length).split("/");
  return `apps/fumadocs/content/docs/${segments.join("/")}.mdx`;
}

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

/** Build the full file path for a content file. */
function contentFilePath(roadmap: string, slug: string, track?: string) {
  const base = "apps/fumadocs/content/docs";
  return track
    ? `${base}/${roadmap}/${track}/${slug}.mdx`
    : `${base}/${roadmap}/${slug}.mdx`;
}

export const contentRouter = router({
  list: adminProcedure.query(async () => {
    const github = getCachedGitHubService();
    const contentBase = "apps/fumadocs/content/docs";

    // 1. Get top-level entries (roadmap directories)
    const topLevel = await github.getDirectoryTree(contentBase);
    const roadmapDirs = topLevel.filter((e) => e.type === "dir");

    // 2. Build pendingMap from open GitHub PRs — no DB needed
    const openPRs = await github.listContentPRs();
    const pendingMap = new Map(openPRs.map((pr) => [filePathFromBranch(pr.branchName), pr.branchName]));
    const roadmapDirNames = new Set(roadmapDirs.map((d) => d.path.split("/").pop()!));

    // Helper: parse file metadata from GitHub
    async function parseFile(filePath: string, trackSlug?: string) {
      const slug = filePath.split("/").pop()!.replace(/\.mdx$/, "");
      let title = slug;
      let resolvedFromPendingBranch = false;
      try {
        const branch = pendingMap.get(filePath);
        const { content } = await github.getFileContent(filePath, branch);
        const parsed = parseMdx(content);
        title = parsed.frontmatter.title || slug;
        resolvedFromPendingBranch = !!branch;
      } catch {
        // fall back to slug as title
      }
      const state = resolvedFromPendingBranch
        ? ("pending_review" as const)
        : ("published" as const);
      return { slug, title, path: filePath, state, track: trackSlug };
    }

    /** Read a meta.json and return its parsed content, or null. */
    async function readMeta(metaPath: string): Promise<{ title?: string; pages?: string[] } | null> {
      try {
        const { content } = await github.getFileContent(metaPath);
        return JSON.parse(content);
      } catch {
        return null;
      }
    }

    // 3. For each roadmap dir, scan for files and track subdirectories
    const results = await Promise.all(
      roadmapDirs.map(async (dir) => {
        const dirName = dir.path.split("/").pop()!;
        const entries = await github.getDirectoryTree(dir.path);
        const roadmapMdxFiles = entries.filter(
          (e) => e.type === "file" && e.path.endsWith(".mdx"),
        );
        const trackDirs = entries.filter((e) => e.type === "dir");

        const seenPaths = new Set<string>();

        // Read the roadmap's meta.json for track ordering
        const roadmapMeta = await readMeta(`${dir.path}/meta.json`);
        const roadmapPages = roadmapMeta?.pages ?? [];

        // Sort track dirs by meta.json page order
        const trackDirMap = new Map(trackDirs.map((d) => [d.path.split("/").pop()!, d]));
        const sortedTrackDirs = [
          // First: tracks listed in meta.json order
          ...roadmapPages
            .filter((name: string) => trackDirMap.has(name))
            .map((name: string) => trackDirMap.get(name)!),
          // Then: any track dirs not in meta.json (shouldn't happen, but defensive)
          ...trackDirs.filter((d) => !roadmapPages.includes(d.path.split("/").pop()!)),
        ];

        // Parse roadmap-level MDX files (index, etc.)
        const topLevelFiles = await Promise.all(
          roadmapMdxFiles.map(async (file) => {
            seenPaths.add(file.path);
            return parseFile(file.path);
          }),
        );

        // Parse track-level MDX files, sorted by track meta.json order
        const trackFiles = await Promise.all(
          sortedTrackDirs.map(async (trackDir) => {
            const trackSlug = trackDir.path.split("/").pop()!;
            const trackEntries = await github.getDirectoryTree(trackDir.path);
            const trackMdxFiles = trackEntries.filter(
              (e) => e.type === "file" && e.path.endsWith(".mdx"),
            );

            // Read the track's meta.json for title and topic ordering
            const trackMeta = await readMeta(`${trackDir.path}/meta.json`);
            const trackPages = trackMeta?.pages ?? [];

            // Build file map for ordering
            const fileMap = new Map(trackMdxFiles.map((f) => [f.path.split("/").pop()!.replace(/\.mdx$/, ""), f]));

            // Sort files by meta.json page order
            const sortedMdxFiles = [
              ...trackPages
                .filter((name: string) => fileMap.has(name))
                .map((name: string) => fileMap.get(name)!),
              ...trackMdxFiles.filter((f) => !trackPages.includes(f.path.split("/").pop()!.replace(/\.mdx$/, ""))),
            ];

            const files = await Promise.all(
              sortedMdxFiles.map(async (file) => {
                seenPaths.add(file.path);
                const parsed = await parseFile(file.path, trackSlug);
                return {
                  ...parsed,
                  trackTitle: trackMeta?.title ?? trackSlug,
                };
              }),
            );
            return files;
          }),
        );

        const allFiles = [...topLevelFiles, ...trackFiles.flat()];

        // Add pending files that only exist on feature branches
        const pendingOnlyFiles = await Promise.all(
          [...pendingMap.entries()]
            .filter(([filePath]) => {
              if (seenPaths.has(filePath)) return false;
              const prefix = `${contentBase}/${dirName}/`;
              return filePath.startsWith(prefix) && filePath.endsWith(".mdx");
            })
            .map(async ([filePath]) => {
              // Derive track from path: content/docs/{roadmap}/{track}/{file}.mdx
              const relative = filePath.slice(`${contentBase}/${dirName}/`.length);
              const parts = relative.split("/");
              const derivedTrack = parts.length > 1 ? parts[0] : undefined;
              return parseFile(filePath, derivedTrack);
            }),
        );

        return { roadmap: dirName, files: [...allFiles, ...pendingOnlyFiles] };
      }),
    );

    // 4. Add pending files for roadmap dirs that don't exist on main yet
    const pendingNewRoadmaps = new Map<string, Array<{ filePath: string; branchName: string }>>();
    for (const [filePath, branchName] of pendingMap) {
      if (!filePath.startsWith(`${contentBase}/`) || !filePath.endsWith(".mdx")) continue;
      const relative = filePath.slice(contentBase.length + 1);
      const parts = relative.split("/");
      if (parts.length < 2) continue;
      const dirName = parts[0];
      if (!dirName) continue;
      if (roadmapDirNames.has(dirName)) continue;
      if (!pendingNewRoadmaps.has(dirName)) pendingNewRoadmaps.set(dirName, []);
      pendingNewRoadmaps.get(dirName)!.push({ filePath, branchName });
    }

    const newRoadmapResults = await Promise.all(
      [...pendingNewRoadmaps.entries()].map(async ([dirName, entries]) => {
        const files = await Promise.all(
          entries.map(async ({ filePath }) => {
            const relative = filePath.slice(`${contentBase}/${dirName}/`.length);
            const parts = relative.split("/");
            const derivedTrack = parts.length > 1 ? parts[0] : undefined;
            return parseFile(filePath, derivedTrack);
          }),
        );
        return { roadmap: dirName, files };
      }),
    );

    return [...results, ...newRoadmapResults];
  }),

  listPending: adminProcedure.query(async () => {
    const github = getCachedGitHubService();
    const prs = await github.listContentPRs();
    return prs.map((pr) => ({
      prNumber: pr.prNumber,
      branchName: pr.branchName,
      filePath: filePathFromBranch(pr.branchName),
      title: pr.title,
    }));
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
    .query(async ({ input }) => {
      const github = getCachedGitHubService();
      const filePath = contentFilePath(input.roadmap, input.slug, input.track);
      const branchName = contentBranchName(input.roadmap, input.slug, input.track);

      // Look up an open PR by the deterministic branch name — no DB needed
      const pr = await github.getPRByBranch(branchName);
      const branch = pr?.branchName;

      let resolvedFromPendingBranch = false;
      let content: string;
      let sha: string;

      try {
        const file = await github.getFileContent(filePath, branch);
        content = file.content;
        sha = file.sha;
        resolvedFromPendingBranch = !!branch;
      } catch (err) {
        if (!pr || !(err instanceof Error) || !err.message.includes("not found")) {
          if (err instanceof Error && err.message.includes("not found")) {
            throw new TRPCError({ code: "NOT_FOUND", message: `File not found: ${filePath}` });
          }
          throw err;
        }
        // PR exists but branch/file not found — fall back to main
        const fallback = await github.getFileContent(filePath);
        content = fallback.content;
        sha = fallback.sha;
        resolvedFromPendingBranch = false;
      }

      const { frontmatter, body } = parseMdx(content);

      // Fetch the main branch body for diffing when viewing a pending version
      let mainBody: string;
      if (pr && resolvedFromPendingBranch) {
        try {
          const { content: mainContent } = await github.getFileContent(filePath);
          mainBody = parseMdx(mainContent).body;
        } catch {
          mainBody = "";
        }
      } else {
        mainBody = body;
      }

      const state = resolvedFromPendingBranch
        ? ("pending_review" as const)
        : ("published" as const);

      return {
        frontmatter,
        body,
        state,
        mainBody,
        fileSha: sha,
        ...(pr && resolvedFromPendingBranch
          ? {
              changeRecord: {
                prNumber: pr.prNumber,
                branchName: pr.branchName,
                baseSha: pr.baseSha,
              },
            }
          : {}),
      };
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
    .mutation(async ({ input }) => {
      return getContentRepository().submitTopicEdit({
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
        track: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isValidSlug(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }
      try {
        return await getContentRepository().createTopic({
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
    .mutation(async ({ input }) => {
      try {
        await getContentRepository().publishTopic(input.prNumber);
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
    .mutation(async ({ input }) => {
      await getContentRepository().discardTopic(input.prNumber);
      return { success: true };
    }),

  checkConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .query(async ({ input }) => {
      return getContentRepository().checkConflict(input.prNumber);
    }),

  keepMineOnConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ input }) => {
      await getContentRepository().keepMineOnConflict(input.prNumber);
      return { success: true };
    }),

  useMainOnConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ input }) => {
      await getContentRepository().useMainOnConflict(input.prNumber);
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
    .mutation(async ({ input }) => {
      await getContentRepository().submitMergedContent({
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
    .mutation(async ({ input }) => {
      if (!isValidSlug(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }
      try {
        return await getContentRepository().createRoadmap(input);
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
    .mutation(async ({ input }) => {
      if (!isValidSlug(input.trackSlug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }
      try {
        return await getContentRepository().createTrack(input);
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
    .mutation(async ({ input }) => {
      if (input.slug === "index") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'The "index" page cannot be deleted directly. Delete the track or roadmap instead.',
        });
      }
      try {
        await getContentRepository().deleteTopic({
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
    .mutation(async ({ input }) => {
      try {
        const { deletedFiles } = await getContentRepository().deleteTrack({
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
    .mutation(async ({ input }) => {
      try {
        const { deletedFiles } = await getContentRepository().deleteRoadmap(
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
    .mutation(async ({ input }) => {
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

      const repo = getContentRepository();

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
