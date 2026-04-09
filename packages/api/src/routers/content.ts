import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@masterdocs/db";
import { user } from "@masterdocs/db/schema/auth";
import { changeRecords } from "@masterdocs/db/schema/change-records";

import { protectedProcedure, router } from "../index";
import { createGitHubService } from "../lib/github";
import { type MdxFrontmatter, isValidSlug, parseMdx, serializeMdx } from "../lib/mdx";

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
  list: adminProcedure.query(async () => {
    const github = createGitHubService();
    const contentBase = "apps/fumadocs/content/docs";

    // 1. Get top-level entries (roadmap directories + loose files)
    const topLevel = await github.getDirectoryTree(contentBase);
    const roadmapDirs = topLevel.filter((e) => e.type === "dir");

    // 2. Fetch all pending change_records in one query
    const pendingRecords = await db
      .select({ filePath: changeRecords.filePath, branchName: changeRecords.branchName })
      .from(changeRecords)
      .where(eq(changeRecords.status, "pending_review"));

    const pendingMap = new Map(pendingRecords.map((r) => [r.filePath, r.branchName]));

    // 3. Collect the set of roadmap dir names we already know about
    const roadmapDirNames = new Set(roadmapDirs.map((d) => d.path.split("/").pop()!));

    // 4. For each roadmap dir, list MDX files and fetch their titles
    const results = await Promise.all(
      roadmapDirs.map(async (dir) => {
        const dirName = dir.path.split("/").pop()!;
        const entries = await github.getDirectoryTree(dir.path);
        const mdxFiles = entries.filter(
          (e) => e.type === "file" && e.path.endsWith(".mdx"),
        );

        // Track which file paths we've already seen on main
        const seenPaths = new Set(mdxFiles.map((f) => f.path));

        const files = await Promise.all(
          mdxFiles.map(async (file) => {
            const slug = file.path
              .split("/")
              .pop()!
              .replace(/\.mdx$/, "");

            let title = slug;
            let track: string | undefined;
            let trackTitle: string | undefined;
            let trackOrder: number | undefined;
            let topicOrder: number | undefined;
            try {
              const branch = pendingMap.get(file.path);
              const { content } = await github.getFileContent(file.path, branch);
              const parsed = parseMdx(content);
              title = parsed.frontmatter.title || slug;
              track = parsed.frontmatter.track;
              trackTitle = parsed.frontmatter.trackTitle;
              trackOrder = parsed.frontmatter.trackOrder;
              topicOrder = parsed.frontmatter.topicOrder;
            } catch {
              // If we can't parse the file, fall back to slug as title
            }

            const state = pendingMap.has(file.path)
              ? ("pending_review" as const)
              : ("published" as const);

            return { slug, title, path: file.path, state, track, trackTitle, trackOrder, topicOrder };
          }),
        );

        // 5. Add pending files that only exist on feature branches (not yet on main)
        const pendingOnlyFiles = await Promise.all(
          [...pendingMap.entries()]
            .filter(([filePath]) => {
              if (seenPaths.has(filePath)) return false;
              // Check this file belongs to this roadmap dir
              const prefix = `${contentBase}/${dirName}/`;
              return filePath.startsWith(prefix) && filePath.endsWith(".mdx");
            })
            .map(async ([filePath, branchName]) => {
              const slug = filePath.split("/").pop()!.replace(/\.mdx$/, "");
              let title = slug;
              let track: string | undefined;
              let trackTitle: string | undefined;
              let trackOrder: number | undefined;
              let topicOrder: number | undefined;
              try {
                const { content } = await github.getFileContent(filePath, branchName);
                const parsed = parseMdx(content);
                title = parsed.frontmatter.title || slug;
                track = parsed.frontmatter.track;
                trackTitle = parsed.frontmatter.trackTitle;
                trackOrder = parsed.frontmatter.trackOrder;
                topicOrder = parsed.frontmatter.topicOrder;
              } catch {
                // fall back to slug as title
              }
              return {
                slug,
                title,
                path: filePath,
                state: "pending_review" as const,
                track,
                trackTitle,
                trackOrder,
                topicOrder,
              };
            }),
        );

        return { roadmap: dirName, files: [...files, ...pendingOnlyFiles] };
      }),
    );

    // 6. Add pending files for roadmap dirs that don't exist on main yet
    const pendingNewRoadmaps = new Map<string, Array<{ filePath: string; branchName: string }>>();
    for (const [filePath, branchName] of pendingMap) {
      if (!filePath.startsWith(`${contentBase}/`) || !filePath.endsWith(".mdx")) continue;
      const relative = filePath.slice(contentBase.length + 1); // e.g. "newroadmap/some-file.mdx"
      const parts = relative.split("/");
      if (parts.length < 2) continue;
      const dirName = parts[0];
      if (roadmapDirNames.has(dirName)) continue; // already handled above
      if (!pendingNewRoadmaps.has(dirName)) pendingNewRoadmaps.set(dirName, []);
      pendingNewRoadmaps.get(dirName)!.push({ filePath, branchName });
    }

    const newRoadmapResults = await Promise.all(
      [...pendingNewRoadmaps.entries()].map(async ([dirName, entries]) => {
        const files = await Promise.all(
          entries.map(async ({ filePath, branchName }) => {
            const slug = filePath.split("/").pop()!.replace(/\.mdx$/, "");
            let title = slug;
            let track: string | undefined;
            let trackTitle: string | undefined;
            let trackOrder: number | undefined;
            let topicOrder: number | undefined;
            try {
              const { content } = await github.getFileContent(filePath, branchName);
              const parsed = parseMdx(content);
              title = parsed.frontmatter.title || slug;
              track = parsed.frontmatter.track;
              trackTitle = parsed.frontmatter.trackTitle;
              trackOrder = parsed.frontmatter.trackOrder;
              topicOrder = parsed.frontmatter.topicOrder;
            } catch {
              // fall back to slug
            }
            return {
              slug,
              title,
              path: filePath,
              state: "pending_review" as const,
              track,
              trackTitle,
              trackOrder,
              topicOrder,
            };
          }),
        );
        return { roadmap: dirName, files };
      }),
    );

    return [...results, ...newRoadmapResults];
  }),

  listPending: adminProcedure.query(async () => {
    const records = await db
      .select({
        id: changeRecords.id,
        filePath: changeRecords.filePath,
        branchName: changeRecords.branchName,
        prNumber: changeRecords.prNumber,
        createdAt: changeRecords.createdAt,
        submitterName: user.name,
        submitterEmail: user.email,
      })
      .from(changeRecords)
      .innerJoin(user, eq(changeRecords.userId, user.id))
      .where(eq(changeRecords.status, "pending_review"));

    return records;
  }),

  get: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        slug: z.string(),
        fromBranch: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const github = createGitHubService();
      const filePath = `apps/fumadocs/content/docs/${input.roadmap}/${input.slug}.mdx`;

      // Look up a pending change_record for this file path
      const [pendingRecord] = await db
        .select()
        .from(changeRecords)
        .where(
          and(
            eq(changeRecords.filePath, filePath),
            eq(changeRecords.status, "pending_review"),
          ),
        )
        .limit(1);

      // Always read from the feature branch when a pending record exists
      const branch = pendingRecord ? pendingRecord.branchName : undefined;

      try {
        const { content, sha } = await github.getFileContent(filePath, branch);
        const { frontmatter, body } = parseMdx(content);

        // Fetch the main branch body for diffing
        let mainBody: string;
        if (pendingRecord) {
          try {
            const { content: mainContent } = await github.getFileContent(filePath);
            mainBody = parseMdx(mainContent).body;
          } catch {
            // File may not exist on main (new file) — that's fine
            mainBody = "";
          }
        } else {
          // No pending changes — content is already from main
          mainBody = body;
        }

        const state = pendingRecord ? "pending_review" as const : "published" as const;

        return {
          frontmatter,
          body,
          state,
          mainBody,
          ...(pendingRecord
            ? {
                changeRecord: {
                  id: pendingRecord.id,
                  branchName: pendingRecord.branchName,
                  prNumber: pendingRecord.prNumber,
                  baseCommitSha: pendingRecord.baseCommitSha,
                },
              }
            : {}),
          fileSha: sha,
        };
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `File not found: ${filePath}`,
          });
        }
        throw err;
      }
    }),

  submit: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        slug: z.string(),
        frontmatter: z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          roadmap: z.string().optional(),
          track: z.string().optional(),
          trackTitle: z.string().optional(),
          trackOrder: z.number().optional(),
          topicOrder: z.number().optional(),
        }),
        body: z.string(),
        fileSha: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const github = createGitHubService();

      // 1. Serialize MDX from frontmatter + body
      const mdxContent = serializeMdx(input.frontmatter, input.body);
      const filePath = `apps/fumadocs/content/docs/${input.roadmap}/${input.slug}.mdx`;

      // 2. Check for an existing pending change record
      const [existingRecord] = await db
        .select()
        .from(changeRecords)
        .where(
          and(
            eq(changeRecords.filePath, filePath),
            eq(changeRecords.status, "pending_review"),
          ),
        )
        .limit(1);

      if (existingRecord) {
        // Update the existing branch: fetch current file SHA from branch, then push new content
        const { sha: currentFileSha } = await github.getFileContent(filePath, existingRecord.branchName);
        await github.createOrUpdateFile({
          path: filePath,
          content: mdxContent,
          message: `Content update: ${input.frontmatter.title}`,
          branch: existingRecord.branchName,
          sha: currentFileSha,
        });
        await github.updatePullRequest({
          prNumber: existingRecord.prNumber,
          title: `Content update: ${input.frontmatter.title}`,
        });
        return { prNumber: existingRecord.prNumber, branchName: existingRecord.branchName, isNew: false };
      }

      // 3. No existing record — create new branch + PR
      const branchName = `content/${input.slug}-${Date.now()}`;
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
      await db.insert(changeRecords).values({
        userId: ctx.session.user.id,
        filePath,
        branchName,
        prNumber: pr.number,
        baseCommitSha: mainSha,
      });
      return { prNumber: pr.number, branchName, isNew: true };
    }),

  create: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        slug: z.string(),
        track: z.string().optional(),
        trackTitle: z.string().optional(),
        trackOrder: z.number().optional(),
        topicOrder: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // 1. Validate slug
      if (!isValidSlug(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }

      const github = createGitHubService();

      // 2. Build file path
      const filePath = `apps/fumadocs/content/docs/${input.roadmap}/${input.slug}.mdx`;

      // 3. Check if file already exists on main
      try {
        await github.getFileContent(filePath);
        // If we get here, the file exists → conflict
        throw new TRPCError({
          code: "CONFLICT",
          message: "File already exists",
        });
      } catch (err) {
        // If it's our own CONFLICT error, re-throw
        if (err instanceof TRPCError && err.code === "CONFLICT") {
          throw err;
        }
        // A "not found" error is expected — the file doesn't exist yet
        if (!(err instanceof Error) || !err.message.includes("not found")) {
          throw err;
        }
      }

      // 4. Create default frontmatter (title derived from slug, with track context if provided)
      const defaultFrontmatter: MdxFrontmatter = {
        title: input.slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        ...(input.track
          ? {
              roadmap: input.roadmap,
              track: input.track,
              trackTitle: input.trackTitle,
              trackOrder: input.trackOrder,
              topicOrder: input.topicOrder,
            }
          : {}),
      };

      // 5. Serialize MDX with empty body
      const mdxContent = serializeMdx(defaultFrontmatter, "");

      // 6. Create branch, commit, and PR
      const branchName = `content/${input.slug}-${Date.now()}`;
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);
      await github.createOrUpdateFile({
        path: filePath,
        content: mdxContent,
        message: `Create new content: ${defaultFrontmatter.title}`,
        branch: branchName,
      });
      const pr = await github.createPullRequest({
        title: `New content: ${defaultFrontmatter.title}`,
        body: `Created new content file: ${filePath}`,
        head: branchName,
        base: "main",
      });

      // 7. Insert change_record
      await db.insert(changeRecords).values({
        userId: ctx.session.user.id,
        filePath,
        branchName,
        prNumber: pr.number,
        baseCommitSha: mainSha,
      });

      // 8. Return PR number and branch name
      return { prNumber: pr.number, branchName };
    }),

  publish: adminProcedure
    .input(
      z.object({
        changeRecordId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. Look up change_record by ID
      const [record] = await db
        .select()
        .from(changeRecords)
        .where(eq(changeRecords.id, input.changeRecordId))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Change record not found",
        });
      }

      // 2. Verify status is pending_review
      if (record.status !== "pending_review") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Change record is not pending review",
        });
      }

      const github = createGitHubService();

      // 3. Try to merge PR using merge commit strategy
      try {
        await github.mergePullRequest(record.prNumber, "merge");
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.toLowerCase().includes("conflict")
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Merge conflict detected",
          });
        }
        throw err;
      }

      // 4. Update change_record status to published
      await db
        .update(changeRecords)
        .set({ status: "published" })
        .where(eq(changeRecords.id, input.changeRecordId));

      // 5. Delete feature branch
      await github.deleteBranch(record.branchName);

      return { success: true };
    }),

  discard: adminProcedure
    .input(
      z.object({
        changeRecordId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. Look up change_record by ID
      const [record] = await db
        .select()
        .from(changeRecords)
        .where(eq(changeRecords.id, input.changeRecordId))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Change record not found",
        });
      }

      const github = createGitHubService();

      // 2. Close the PR
      await github.closePullRequest(record.prNumber);

      // 3. Delete the feature branch
      await github.deleteBranch(record.branchName);

      // 4. Delete the change_record from DB
      await db
        .delete(changeRecords)
        .where(eq(changeRecords.id, input.changeRecordId));

      return { success: true };
    }),

  checkConflict: adminProcedure
    .input(
      z.object({
        changeRecordId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      // 1. Look up change_record by ID
      const [record] = await db
        .select()
        .from(changeRecords)
        .where(eq(changeRecords.id, input.changeRecordId))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Change record not found",
        });
      }

      const github = createGitHubService();

      // 2. Get current main HEAD SHA
      const mainSha = await github.getMainHeadSha();

      // 3. If main HEAD === record.baseCommitSha, no conflict
      if (mainSha === record.baseCommitSha) {
        return {
          hasConflict: false,
          mainAdvanced: false,
          currentMainSha: mainSha,
        };
      }

      // 4. Main has advanced — compare commits to see if the same file was modified
      const comparison = await github.compareCommits(record.baseCommitSha, mainSha);
      const fileWasModified = comparison.files.some(
        (f) => f.filename === record.filePath,
      );

      // 5. Return conflict status
      return {
        hasConflict: fileWasModified,
        mainAdvanced: true,
        currentMainSha: mainSha,
      };
    }),

  resolveConflict: adminProcedure
    .input(
      z.object({
        changeRecordId: z.string(),
        strategy: z.enum(["keep_mine", "use_main", "manual"]),
        manualContent: z
          .object({
            frontmatter: z.object({
              title: z.string().min(1),
              description: z.string().optional(),
              roadmap: z.string().optional(),
              track: z.string().optional(),
              trackTitle: z.string().optional(),
              trackOrder: z.number().optional(),
              topicOrder: z.number().optional(),
            }),
            body: z.string(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. Look up change_record by ID
      const [record] = await db
        .select()
        .from(changeRecords)
        .where(eq(changeRecords.id, input.changeRecordId))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Change record not found",
        });
      }

      const github = createGitHubService();

      switch (input.strategy) {
        case "keep_mine": {
          // Read the file from the feature branch, then re-commit it
          // to force the branch to be up-to-date
          const { content, sha: fileSha } = await github.getFileContent(
            record.filePath,
            record.branchName,
          );
          await github.createOrUpdateFile({
            path: record.filePath,
            content,
            message: `Resolve conflict: keep my changes for ${record.filePath}`,
            branch: record.branchName,
            sha: fileSha,
          });
          return { success: true };
        }

        case "use_main": {
          // Close PR, delete branch, delete change_record
          await github.closePullRequest(record.prNumber);
          await github.deleteBranch(record.branchName);
          await db
            .delete(changeRecords)
            .where(eq(changeRecords.id, input.changeRecordId));
          return { success: true };
        }

        case "manual": {
          // Validate manualContent is provided
          if (!input.manualContent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Manual content is required for manual resolution strategy",
            });
          }

          // Serialize MDX from manual content
          const mdxContent = serializeMdx(
            input.manualContent.frontmatter,
            input.manualContent.body,
          );

          // Get the file SHA from the branch, then commit the manual content
          const { sha: fileSha } = await github.getFileContent(
            record.filePath,
            record.branchName,
          );
          await github.createOrUpdateFile({
            path: record.filePath,
            content: mdxContent,
            message: `Resolve conflict: manual edit for ${record.filePath}`,
            branch: record.branchName,
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
    .mutation(async ({ input, ctx }) => {
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
        { title: input.title, pages: [] },
        null,
        2,
      ) + "\n";
      await github.createOrUpdateFile({
        path: `${contentBase}/${input.slug}/meta.json`,
        content: metaJson,
        message: `Create roadmap meta.json: ${input.title}`,
        branch: branchName,
      });

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
        trackOrder: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // The track slug is used as the first topic file name
      const fileSlug = input.trackSlug;

      if (!isValidSlug(fileSlug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must contain only lowercase letters, numbers, and hyphens",
        });
      }

      const github = createGitHubService();
      const filePath = `apps/fumadocs/content/docs/${input.roadmap}/${fileSlug}.mdx`;

      // Check the file doesn't already exist
      try {
        await github.getFileContent(filePath);
        throw new TRPCError({ code: "CONFLICT", message: "File already exists" });
      } catch (err) {
        if (err instanceof TRPCError && err.code === "CONFLICT") throw err;
        if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
      }

      const frontmatter = {
        title: input.trackTitle
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        roadmap: input.roadmap,
        track: input.trackSlug,
        trackTitle: input.trackTitle,
        trackOrder: input.trackOrder,
        topicOrder: 1,
      };

      const mdxContent = serializeMdx(frontmatter, "");

      const branchName = `content/${fileSlug}-${Date.now()}`;
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);
      await github.createOrUpdateFile({
        path: filePath,
        content: mdxContent,
        message: `Create new track: ${input.trackTitle}`,
        branch: branchName,
      });

      const pr = await github.createPullRequest({
        title: `New track: ${input.trackTitle}`,
        body: `Created new track in ${input.roadmap}: ${input.trackTitle}`,
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

  /** Reorder tracks and/or topics within a roadmap. Commits directly via a temp branch + auto-merge. */
  reorder: adminProcedure
    .input(
      z.object({
        roadmap: z.string(),
        items: z.array(
          z.object({
            slug: z.string(),
            trackOrder: z.number().optional(),
            topicOrder: z.number().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const github = createGitHubService();
      const contentBase = "apps/fumadocs/content/docs";

      const branchName = `content/reorder-${input.roadmap}-${Date.now()}`;
      const mainSha = await github.getMainHeadSha();
      await github.createBranch(branchName, mainSha);

      let anyChanged = false;

      for (const item of input.items) {
        const filePath = `${contentBase}/${input.roadmap}/${item.slug}.mdx`;
        const { content, sha } = await github.getFileContent(filePath);
        const parsed = parseMdx(content);

        let changed = false;
        if (item.trackOrder !== undefined && parsed.frontmatter.trackOrder !== item.trackOrder) {
          parsed.frontmatter.trackOrder = item.trackOrder;
          changed = true;
        }
        if (item.topicOrder !== undefined && parsed.frontmatter.topicOrder !== item.topicOrder) {
          parsed.frontmatter.topicOrder = item.topicOrder;
          changed = true;
        }

        if (changed) {
          anyChanged = true;
          const mdxContent = serializeMdx(parsed.frontmatter, parsed.body);
          await github.createOrUpdateFile({
            path: filePath,
            content: mdxContent,
            message: `Reorder: ${parsed.frontmatter.title}`,
            branch: branchName,
            sha,
          });
        }
      }

      if (!anyChanged) {
        await github.deleteBranch(branchName);
        return { success: true };
      }

      // Create PR and auto-merge so reorder takes effect immediately
      const pr = await github.createPullRequest({
        title: `Reorder content in ${input.roadmap}`,
        body: "Automated reorder of content items",
        head: branchName,
        base: "main",
      });

      try {
        await github.mergePullRequest(pr.number, "merge");
        await github.deleteBranch(branchName);
      } catch {
        // If auto-merge fails (e.g. branch protection), leave PR open
      }

      return { success: true };
    }),
});
