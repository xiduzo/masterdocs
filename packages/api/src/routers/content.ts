import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import type { GitHubService } from "../lib/github";
import { getCachedGitHubService } from "../lib/github-cache";
import { isValidSlug, parseMdx } from "../lib/mdx";
import {
  ContentAlreadyExistsError,
  ContentMergeConflictError,
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

const CONTENT_DOCS_BASE = "apps/fumadocs/content/docs";

function removePageFromMeta(rawMeta: string, page: string): string | null {
  try {
    const parsed = JSON.parse(rawMeta);
    if (!Array.isArray(parsed.pages) || !parsed.pages.includes(page)) return null;
    parsed.pages = parsed.pages.filter((p: string) => p !== page);
    return JSON.stringify(parsed, null, 2) + "\n";
  } catch {
    return null;
  }
}

async function listFilesRecursively(
  github: GitHubService,
  dirPath: string,
  branch = "main",
): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [dirPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const entries = await github.getDirectoryTree(current, branch);
    for (const entry of entries) {
      if (entry.type === "file") {
        files.push(entry.path);
      } else if (entry.type === "dir") {
        queue.push(entry.path);
      }
    }
  }

  return files;
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

      const github = getCachedGitHubService();
      const filePath = contentFilePath(input.roadmap, input.slug, input.track);

      let fileSha: string;
      try {
        fileSha = (await github.getFileContent(filePath, "main")).sha;
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        }
        throw err;
      }

      await github.deleteFile({
        path: filePath,
        message: `Delete content: ${input.slug}`,
        branch: "main",
        sha: fileSha,
      });

      const metaPath = input.track
        ? `${CONTENT_DOCS_BASE}/${input.roadmap}/${input.track}/meta.json`
        : `${CONTENT_DOCS_BASE}/${input.roadmap}/meta.json`;

      try {
        const { content: metaRaw, sha: metaSha } = await github.getFileContent(metaPath, "main");
        const updatedMeta = removePageFromMeta(metaRaw, input.slug);
        if (updatedMeta) {
          await github.createOrUpdateFile({
            path: metaPath,
            content: updatedMeta,
            message: `Remove ${input.slug} from meta.json`,
            branch: "main",
            sha: metaSha,
          });
        }
      } catch {
        // Skip if meta.json is missing or invalid.
      }

      return { success: true };
    }),

  deleteTrack: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        track: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const github = getCachedGitHubService();
      const trackDir = `${CONTENT_DOCS_BASE}/${input.roadmap}/${input.track}`;

      try {
        await github.getDirectoryTree(trackDir, "main");
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
        }
        throw err;
      }

      const trackFiles = await listFilesRecursively(github, trackDir, "main");
      for (const filePath of trackFiles.sort((a, b) => b.length - a.length)) {
        const { sha } = await github.getFileContent(filePath, "main");
        await github.deleteFile({
          path: filePath,
          message: `Delete track file: ${filePath}`,
          branch: "main",
          sha,
        });
      }

      const roadmapMetaPath = `${CONTENT_DOCS_BASE}/${input.roadmap}/meta.json`;
      try {
        const { content: metaRaw, sha: metaSha } = await github.getFileContent(roadmapMetaPath, "main");
        const updatedMeta = removePageFromMeta(metaRaw, input.track);
        if (updatedMeta) {
          await github.createOrUpdateFile({
            path: roadmapMetaPath,
            content: updatedMeta,
            message: `Remove track ${input.track} from roadmap meta.json`,
            branch: "main",
            sha: metaSha,
          });
        }
      } catch {
        // Skip if meta.json is missing or invalid.
      }

      // Evict any cached sub-tree listings under the removed track, and the
      // roadmap-level listing that still shows the track folder.
      github.invalidate.prefix(trackDir, "main");
      github.invalidate.tree(`${CONTENT_DOCS_BASE}/${input.roadmap}`, "main");

      return { success: true, deletedFiles: trackFiles.length };
    }),

  deleteRoadmap: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const github = getCachedGitHubService();
      const roadmapDir = `${CONTENT_DOCS_BASE}/${input.roadmap}`;

      try {
        await github.getDirectoryTree(roadmapDir, "main");
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Roadmap not found" });
        }
        throw err;
      }

      const roadmapFiles = await listFilesRecursively(github, roadmapDir, "main");
      for (const filePath of roadmapFiles.sort((a, b) => b.length - a.length)) {
        const { sha } = await github.getFileContent(filePath, "main");
        await github.deleteFile({
          path: filePath,
          message: `Delete roadmap file: ${filePath}`,
          branch: "main",
          sha,
        });
      }

      const roadmapMetaPath = `apps/fumadocs/content/roadmaps/${input.roadmap}.mdx`;
      try {
        const { sha } = await github.getFileContent(roadmapMetaPath, "main");
        await github.deleteFile({
          path: roadmapMetaPath,
          message: `Delete roadmap metadata: ${input.roadmap}`,
          branch: "main",
          sha,
        });
      } catch {
        // Skip if metadata file does not exist.
      }

      const rootMetaPath = `${CONTENT_DOCS_BASE}/meta.json`;
      try {
        const { content: rootMetaRaw, sha: rootMetaSha } = await github.getFileContent(rootMetaPath, "main");
        const updatedRootMeta = removePageFromMeta(rootMetaRaw, input.roadmap);
        if (updatedRootMeta) {
          await github.createOrUpdateFile({
            path: rootMetaPath,
            content: updatedRootMeta,
            message: `Remove roadmap ${input.roadmap} from root meta.json`,
            branch: "main",
            sha: rootMetaSha,
          });
        }
      } catch {
        // Skip if root meta.json is missing or invalid.
      }

      // Evict any cached sub-trees under the removed roadmap, plus the
      // top-level listings that still show the roadmap dir + metadata file.
      github.invalidate.prefix(roadmapDir, "main");
      github.invalidate.tree(CONTENT_DOCS_BASE, "main");
      github.invalidate.tree("apps/fumadocs/content/roadmaps", "main");

      return { success: true, deletedFiles: roadmapFiles.length };
    }),

  /** Reorder tracks and/or topics within a roadmap. Updates meta.json files directly on main. */
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

      const github = getCachedGitHubService();
      const contentBase = "apps/fumadocs/content/docs";

      // Group items by track to determine which meta.json files to update
      const trackTopics = new Map<string, { slug: string; topicOrder?: number }[]>();
      const trackOrders = new Map<string, number>();

      for (const item of input.items) {
        if (item.track) {
          if (item.topicOrder !== undefined) {
            const bucket = trackTopics.get(item.track) ?? [];
            bucket.push({ slug: item.slug, topicOrder: item.topicOrder });
            trackTopics.set(item.track, bucket);
          }
          if (item.trackOrder !== undefined) {
            trackOrders.set(item.track, item.trackOrder);
          }
        }
      }

      let anyChanged = false;

      // Update track meta.json files (topic ordering within tracks)
      for (const [track, topics] of trackTopics) {
        const metaPath = `${contentBase}/${input.roadmap}/${track}/meta.json`;
        try {
          const { content: metaRaw, sha } = await github.getFileContent(metaPath, "main");
          const meta = JSON.parse(metaRaw);
          if (!Array.isArray(meta.pages)) continue;

          // Sort topics by new topicOrder, keep "index" first
          const sorted = [...topics].sort((a, b) => (a.topicOrder ?? 0) - (b.topicOrder ?? 0));
          const orderedTopics = sorted.map((t) => t.slug).filter((s) => s !== "index");
          const remainingTopics = meta.pages.filter(
            (page: string) => page !== "index" && !orderedTopics.includes(page),
          );
          const newPages = ["index", ...orderedTopics, ...remainingTopics];

          // Only update if order actually changed
          if (JSON.stringify(meta.pages) !== JSON.stringify(newPages)) {
            meta.pages = newPages;
            anyChanged = true;
            await github.createOrUpdateFile({
              path: metaPath,
              content: JSON.stringify(meta, null, 2) + "\n",
              message: `Reorder topics in ${track}`,
              branch: "main",
              sha,
            });
          }
        } catch {
          // Skip if meta.json doesn't exist
        }
      }

      // Update roadmap meta.json (track ordering)
      if (trackOrders.size > 0) {
        const metaPath = `${contentBase}/${input.roadmap}/meta.json`;
        try {
          const { content: metaRaw, sha } = await github.getFileContent(metaPath, "main");
          const meta = JSON.parse(metaRaw);
          if (Array.isArray(meta.pages)) {
            const sorted = [...trackOrders.entries()].sort(([, a], [, b]) => a - b);
            const orderedTracks = sorted.map(([track]) => track).filter((track) => track !== "index");
            const remainingTracks = meta.pages.filter(
              (page: string) => page !== "index" && !orderedTracks.includes(page),
            );
            const newPages = ["index", ...orderedTracks, ...remainingTracks];

            if (JSON.stringify(meta.pages) !== JSON.stringify(newPages)) {
              meta.pages = newPages;
              anyChanged = true;
              await github.createOrUpdateFile({
                path: metaPath,
                content: JSON.stringify(meta, null, 2) + "\n",
                message: `Reorder tracks in ${input.roadmap}`,
                branch: "main",
                sha,
              });
            }
          }
        } catch {
          // Skip if meta.json doesn't exist
        }
      }

      if (!anyChanged) {
        return { success: true };
      }

      return { success: true };
    }),
});
