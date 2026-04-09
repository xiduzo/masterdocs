import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { createGitHubService } from "../lib/github";
import { type MdxFrontmatter, isValidSlug, parseMdx, serializeMdx } from "../lib/mdx";

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

/**
 * Ensure a roadmap directory has an index.mdx on the given branch.
 * Creates one if missing. Returns true if the file was created.
 */
async function ensureRoadmapIndex(
  github: ReturnType<typeof createGitHubService>,
  roadmapSlug: string,
  title: string,
  branch: string,
) {
  const indexPath = `apps/fumadocs/content/docs/${roadmapSlug}/index.mdx`;
  try {
    await github.getFileContent(indexPath, branch);
    return false; // already exists
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
  }
  const indexMdx = serializeMdx({ title }, "");
  await github.createOrUpdateFile({
    path: indexPath,
    content: indexMdx,
    message: `Create index page for ${title}`,
    branch,
  });
  return true;
}

/** Build the full file path for a content file. */
function contentFilePath(roadmap: string, slug: string, track?: string) {
  const base = "apps/fumadocs/content/docs";
  return track
    ? `${base}/${roadmap}/${track}/${slug}.mdx`
    : `${base}/${roadmap}/${slug}.mdx`;
}

export const contentRouter = router({
  list: adminProcedure.query(async () => {
    const github = createGitHubService();
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
    const github = createGitHubService();
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
      const github = createGitHubService();
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
      const github = createGitHubService();

      // 1. Serialize MDX from frontmatter + body
      const mdxContent = serializeMdx(input.frontmatter, input.body);
      const filePath = contentFilePath(input.roadmap, input.slug, input.track);
      const branchName = contentBranchName(input.roadmap, input.slug, input.track);

      // 2. Check for an existing open PR via GitHub — no DB needed
      const existingPR = await github.getPRByBranch(branchName);
      if (existingPR) {
        const { sha: currentFileSha } = await github.getFileContent(filePath, branchName);
        await github.createOrUpdateFile({
          path: filePath,
          content: mdxContent,
          message: `Content update: ${input.frontmatter.title}`,
          branch: branchName,
          sha: currentFileSha,
        });
        await github.updatePullRequest({
          prNumber: existingPR.prNumber,
          title: `Content update: ${input.frontmatter.title}`,
        });
        return { prNumber: existingPR.prNumber, branchName, isNew: false };
      }

      // 3. No open PR — clean up stale branch if it exists, then create fresh
      if (await github.branchExists(branchName)) {
        await github.deleteBranch(branchName);
      }
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);
      await github.createOrUpdateFile({
        path: filePath,
        content: mdxContent,
        message: `Content update: ${input.frontmatter.title}`,
        branch: branchName,
        sha: input.fileSha,
      });
      const pr = await github.createPullRequest({
        title: `Content update: ${input.frontmatter.title}`,
        body: `Updated content file: ${filePath}`,
        head: branchName,
        base: "main",
      });
      return { prNumber: pr.number, branchName, isNew: true };
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
      // 1. Validate slug
      if (!isValidSlug(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }

      const github = createGitHubService();

      // 2. Build file path (nested under track directory)
      const filePath = contentFilePath(input.roadmap, input.slug, input.track);

      // 3. Check if file already exists on main
      try {
        await github.getFileContent(filePath);
        throw new TRPCError({ code: "CONFLICT", message: "File already exists" });
      } catch (err) {
        if (err instanceof TRPCError && err.code === "CONFLICT") throw err;
        if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
      }

      // 4. Create default frontmatter
      const defaultFrontmatter: MdxFrontmatter = {
        title: input.slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      };

      // 5. Use the deterministic branch name so submit/get can locate this PR later
      const branchName = contentBranchName(input.roadmap, input.slug, input.track);
      // Clean up any stale abandoned branch
      if (await github.branchExists(branchName)) {
        await github.deleteBranch(branchName);
      }
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);

      // Ensure the roadmap has an index page
      await ensureRoadmapIndex(github, input.roadmap, input.roadmap, branchName);

      await github.createOrUpdateFile({
        path: filePath,
        content: serializeMdx(defaultFrontmatter, ""),
        message: `Create new content: ${defaultFrontmatter.title}`,
        branch: branchName,
      });

      // Update the track's meta.json to include the new page
      const metaPath = `apps/fumadocs/content/docs/${input.roadmap}/${input.track}/meta.json`;
      try {
        const { content: metaRaw, sha: metaSha } = await github.getFileContent(metaPath, branchName);
        const meta = JSON.parse(metaRaw);
        if (Array.isArray(meta.pages) && !meta.pages.includes(input.slug)) {
          meta.pages.push(input.slug);
          await github.createOrUpdateFile({
            path: metaPath,
            content: JSON.stringify(meta, null, 2) + "\n",
            message: `Add ${input.slug} to ${input.track}/meta.json`,
            branch: branchName,
            sha: metaSha,
          });
        }
      } catch {
        // If meta.json doesn't exist or can't be read, skip
      }

      const pr = await github.createPullRequest({
        title: `New content: ${defaultFrontmatter.title}`,
        body: `Created new content file: ${filePath}`,
        head: branchName,
        base: "main",
      });

      return { prNumber: pr.number, branchName };
    }),

  publish: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ input }) => {
      const github = createGitHubService();
      const pr = await github.getPR(input.prNumber);

      try {
        await github.mergePullRequest(pr.prNumber, "merge");
      } catch (err) {
        if (err instanceof Error && err.message.toLowerCase().includes("conflict")) {
          throw new TRPCError({ code: "CONFLICT", message: "Merge conflict detected" });
        }
        throw err;
      }

      await github.deleteBranch(pr.branchName);
      return { success: true };
    }),

  discard: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .mutation(async ({ input }) => {
      const github = createGitHubService();
      const pr = await github.getPR(input.prNumber);
      await github.closePullRequest(pr.prNumber);
      await github.deleteBranch(pr.branchName);
      return { success: true };
    }),

  checkConflict: adminProcedure
    .input(z.object({ prNumber: z.number() }))
    .query(async ({ input }) => {
      const github = createGitHubService();
      const pr = await github.getPR(input.prNumber);
      const mainSha = await github.getMainHeadSha();

      if (mainSha === pr.baseSha) {
        return { hasConflict: false, mainAdvanced: false, currentMainSha: mainSha };
      }

      const filePath = filePathFromBranch(pr.branchName);
      const comparison = await github.compareCommits(pr.baseSha, mainSha);
      const fileWasModified = comparison.files.some((f) => f.filename === filePath);

      return { hasConflict: fileWasModified, mainAdvanced: true, currentMainSha: mainSha };
    }),

  resolveConflict: adminProcedure
    .input(
      z.object({
        prNumber: z.number(),
        strategy: z.enum(["keep_mine", "use_main", "manual"]),
        manualContent: z
          .object({
            frontmatter: z.object({
              title: z.string().min(1),
              description: z.string().optional(),
            }),
            body: z.string(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const github = createGitHubService();
      const pr = await github.getPR(input.prNumber);
      const filePath = filePathFromBranch(pr.branchName);

      switch (input.strategy) {
        case "keep_mine": {
          const { content, sha: fileSha } = await github.getFileContent(filePath, pr.branchName);
          await github.createOrUpdateFile({
            path: filePath,
            content,
            message: `Resolve conflict: keep my changes for ${filePath}`,
            branch: pr.branchName,
            sha: fileSha,
          });
          return { success: true };
        }

        case "use_main": {
          await github.closePullRequest(pr.prNumber);
          await github.deleteBranch(pr.branchName);
          return { success: true };
        }

        case "manual": {
          if (!input.manualContent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Manual content is required for manual resolution strategy",
            });
          }
          const mdxContent = serializeMdx(input.manualContent.frontmatter, input.manualContent.body);
          const { sha: fileSha } = await github.getFileContent(filePath, pr.branchName);
          await github.createOrUpdateFile({
            path: filePath,
            content: mdxContent,
            message: `Resolve conflict: manual edit for ${filePath}`,
            branch: pr.branchName,
            sha: fileSha,
          });
          return { success: true };
        }
      }
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

      const github = createGitHubService();
      const contentBase = "apps/fumadocs/content/docs";

      // Check if the roadmap directory already exists
      try {
        await github.getDirectoryTree(`${contentBase}/${input.slug}`);
        throw new TRPCError({
          code: "CONFLICT",
          message: "Roadmap already exists",
        });
      } catch (err) {
        if (err instanceof TRPCError && err.code === "CONFLICT") throw err;
        // "not found" is expected — continue
        if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
      }

      const branchName = `content/roadmap-${input.slug}-${Date.now()}`;
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);

      // 1. content/roadmaps/{slug}.mdx — roadmap metadata
      const roadmapMdx = serializeMdx(
        { title: input.title, description: input.description },
        "",
      );
      await github.createOrUpdateFile({
        path: `apps/fumadocs/content/roadmaps/${input.slug}.mdx`,
        content: roadmapMdx,
        message: `Create roadmap metadata: ${input.title}`,
        branch: branchName,
      });

      // 2. content/docs/{slug}/index.mdx — landing page
      const indexMdx = serializeMdx(
        { title: input.title, description: input.description },
        "",
      );
      await github.createOrUpdateFile({
        path: `${contentBase}/${input.slug}/index.mdx`,
        content: indexMdx,
        message: `Create roadmap index: ${input.title}`,
        branch: branchName,
      });

      // 3. content/docs/{slug}/meta.json — page ordering
      const metaJson = JSON.stringify(
        { title: input.title, pages: ["index", "...rest"] },
        null,
        2,
      ) + "\n";
      await github.createOrUpdateFile({
        path: `${contentBase}/${input.slug}/meta.json`,
        content: metaJson,
        message: `Create roadmap meta.json: ${input.title}`,
        branch: branchName,
      });

      // 4. Update root meta.json to include the new roadmap in the sidebar
      try {
        const { content: rootMetaRaw, sha: rootMetaSha } = await github.getFileContent(
          `${contentBase}/meta.json`,
          branchName,
        );
        const rootMeta = JSON.parse(rootMetaRaw);
        if (Array.isArray(rootMeta.pages) && !rootMeta.pages.includes(input.slug)) {
          rootMeta.pages.push(input.slug);
          await github.createOrUpdateFile({
            path: `${contentBase}/meta.json`,
            content: JSON.stringify(rootMeta, null, 2) + "\n",
            message: `Add ${input.slug} to root meta.json`,
            branch: branchName,
            sha: rootMetaSha,
          });
        }
      } catch {
        // If root meta.json doesn't exist or can't be read, skip
      }

      // 4. PR + auto-merge so the roadmap scaffold appears immediately
      const pr = await github.createPullRequest({
        title: `New roadmap: ${input.title}`,
        body: `Created new roadmap: ${input.slug}`,
        head: branchName,
        base: "main",
      });

      try {
        await github.mergePullRequest(pr.number, "merge");
        await github.deleteBranch(branchName);
      } catch {
        // If auto-merge fails (e.g. branch protection), leave PR open
      }

      return { prNumber: pr.number, branchName };
    }),

  /** Create a new track (sub-section) inside a roadmap by creating its first topic file. */
  createTrack: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        trackSlug: z.string(),
        trackTitle: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const trackSlug = input.trackSlug;

      if (!isValidSlug(trackSlug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }

      const github = createGitHubService();
      const contentBase = "apps/fumadocs/content/docs";
      const trackDir = `${contentBase}/${input.roadmap}/${trackSlug}`;

      // Check the track directory doesn't already exist
      try {
        await github.getDirectoryTree(trackDir);
        throw new TRPCError({ code: "CONFLICT", message: "Track already exists" });
      } catch (err) {
        if (err instanceof TRPCError && err.code === "CONFLICT") throw err;
        if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
      }

      const branchName = `content/${trackSlug}-${Date.now()}`;
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);

      // Ensure the roadmap has an index page
      await ensureRoadmapIndex(github, input.roadmap, input.roadmap, branchName);

      // 1. Create track index.mdx
      const trackTitle = input.trackTitle
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const indexMdx = serializeMdx({ title: trackTitle, description: "" }, "");
      await github.createOrUpdateFile({
        path: `${trackDir}/index.mdx`,
        content: indexMdx,
        message: `Create track index: ${trackTitle}`,
        branch: branchName,
      });

      // 2. Create track meta.json
      const trackMeta = JSON.stringify(
        { title: trackTitle, pages: ["index"] },
        null,
        2,
      ) + "\n";
      await github.createOrUpdateFile({
        path: `${trackDir}/meta.json`,
        content: trackMeta,
        message: `Create track meta.json: ${trackTitle}`,
        branch: branchName,
      });

      // 3. Update the roadmap's meta.json to include the new track folder
      const roadmapMetaPath = `${contentBase}/${input.roadmap}/meta.json`;
      try {
        const { content: metaRaw, sha: metaSha } = await github.getFileContent(
          roadmapMetaPath,
          branchName,
        );
        const meta = JSON.parse(metaRaw);
        if (Array.isArray(meta.pages) && !meta.pages.includes(trackSlug)) {
          meta.pages.push(trackSlug);
          await github.createOrUpdateFile({
            path: roadmapMetaPath,
            content: JSON.stringify(meta, null, 2) + "\n",
            message: `Add ${trackSlug} to roadmap meta.json`,
            branch: branchName,
            sha: metaSha,
          });
        }
      } catch {
        // If meta.json doesn't exist or can't be read, skip
      }

      const pr = await github.createPullRequest({
        title: `New track: ${trackTitle}`,
        body: `Created new track in ${input.roadmap}: ${trackTitle}`,
        head: branchName,
        base: "main",
      });

      try {
        await github.mergePullRequest(pr.number, "merge");
        await github.deleteBranch(branchName);
      } catch {
        // If auto-merge fails (e.g. branch protection), leave PR open
      }

      return { prNumber: pr.number, branchName };
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

      const github = createGitHubService();
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
