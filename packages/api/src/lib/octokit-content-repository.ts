/**
 * Production ContentRepository adapter — wraps the GitHub-backed
 * CachedGitHubService and implements the domain verbs.
 *
 * Currently covers the Submission lifecycle slice (submit/publish/
 * discard). Other slices will be added as `content.ts` is migrated.
 */

import {
  CONTENT_DOCS_BASE,
  ROADMAP_META_BASE,
  contentBranchName,
  contentFilePath,
  filePathFromBranch,
  type ContentCoords,
} from "./content-paths";
import {
  type CachedGitHubService,
  getCachedGitHubService,
} from "./github-cache";
import type { GitHubService } from "./github";
import { serializeMdx } from "./mdx";
import {
  ContentAlreadyExistsError,
  ContentMergeConflictError,
  type ConflictStatus,
  type ContentRepository,
  type SubmissionRef,
  type SubmitTopicEditResult,
} from "./content-repository";

export { ContentAlreadyExistsError, ContentMergeConflictError };

function humanize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function ensureRoadmapIndex(
  github: GitHubService,
  roadmapSlug: string,
  title: string,
  branch: string,
): Promise<void> {
  const indexPath = `${CONTENT_DOCS_BASE}/${roadmapSlug}/index.mdx`;
  try {
    await github.getFileContent(indexPath, branch);
    return;
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
}

async function patchMetaPages(
  github: GitHubService,
  metaPath: string,
  branch: string,
  page: string,
  commitMessage: string,
): Promise<void> {
  try {
    const { content: raw, sha } = await github.getFileContent(metaPath, branch);
    const meta = JSON.parse(raw);
    if (!Array.isArray(meta.pages) || meta.pages.includes(page)) return;
    meta.pages.push(page);
    await github.createOrUpdateFile({
      path: metaPath,
      content: JSON.stringify(meta, null, 2) + "\n",
      message: commitMessage,
      branch,
      sha,
    });
  } catch {
    // missing or unreadable meta.json → skip (matches previous behaviour)
  }
}

class OctokitContentRepository implements ContentRepository {
  constructor(private readonly github: CachedGitHubService) {}

  async submitTopicEdit({
    coords,
    frontmatter,
    body,
    fileSha,
  }: Parameters<ContentRepository["submitTopicEdit"]>[0]): Promise<SubmitTopicEditResult> {
    const mdxContent = serializeMdx(frontmatter, body);
    const filePath = contentFilePath(coords);
    const branchName = contentBranchName(coords);

    const existingPR = await this.github.getPRByBranch(branchName);

    if (existingPR) {
      const { sha: currentFileSha } = await this.github.getFileContent(
        filePath,
        branchName,
      );
      await this.github.createOrUpdateFile({
        path: filePath,
        content: mdxContent,
        message: `Content update: ${frontmatter.title}`,
        branch: branchName,
        sha: currentFileSha,
      });
      await this.github.updatePullRequest({
        prNumber: existingPR.prNumber,
        title: `Content update: ${frontmatter.title}`,
      });
      return {
        prNumber: existingPR.prNumber,
        branchName: existingPR.branchName,
        isNew: false,
      };
    }

    // No open PR — clean up any stale branch (e.g. from a previous discard
    // that left the branch behind) and start a fresh Submission.
    if (await this.github.branchExists(branchName)) {
      await this.github.deleteBranch(branchName);
    }
    const mainSha = await this.github.getMainHeadSha();
    await this.github.createBranch(branchName, mainSha);
    await this.github.createOrUpdateFile({
      path: filePath,
      content: mdxContent,
      message: `Content update: ${frontmatter.title}`,
      branch: branchName,
      sha: fileSha,
    });
    const pr = await this.github.createPullRequest({
      title: `Content update: ${frontmatter.title}`,
      body: `Updated content file: ${filePath}`,
      head: branchName,
      base: "main",
    });
    return { prNumber: pr.number, branchName, isNew: true };
  }

  async publishTopic(prNumber: number): Promise<void> {
    const pr = await this.github.getPR(prNumber);

    try {
      await this.github.mergePullRequest(pr.prNumber, "merge");
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("conflict")) {
        // Caller is expected to convert this into a domain-level
        // ContentMergeConflict — for now, re-throw with a tag the
        // tRPC layer recognises.
        throw new ContentMergeConflictError();
      }
      throw err;
    }

    // The merged file now exists on main — evict stale main-branch reads
    // for that file and the directory listing that contained it.
    const mergedFilePath = filePathFromBranch(pr.branchName);
    this.github.invalidate.file(mergedFilePath, "main");
    const mergedParent = mergedFilePath.slice(0, mergedFilePath.lastIndexOf("/"));
    this.github.invalidate.tree(mergedParent, "main");

    await this.github.deleteBranch(pr.branchName);
  }

  async discardTopic(prNumber: number): Promise<void> {
    const pr = await this.github.getPR(prNumber);
    await this.github.closePullRequest(pr.prNumber);
    await this.github.deleteBranch(pr.branchName);
  }

  async checkConflict(prNumber: number): Promise<ConflictStatus> {
    const pr = await this.github.getPR(prNumber);
    const mainSha = await this.github.getMainHeadSha();

    if (mainSha === pr.baseSha) {
      return { hasConflict: false, mainAdvanced: false, currentMainSha: mainSha };
    }

    const filePath = filePathFromBranch(pr.branchName);
    const comparison = await this.github.compareCommits(pr.baseSha, mainSha);
    const fileWasModified = comparison.files.some((f) => f.filename === filePath);

    return { hasConflict: fileWasModified, mainAdvanced: true, currentMainSha: mainSha };
  }

  async keepMineOnConflict(prNumber: number): Promise<void> {
    const pr = await this.github.getPR(prNumber);
    const filePath = filePathFromBranch(pr.branchName);
    const { content, sha: fileSha } = await this.github.getFileContent(
      filePath,
      pr.branchName,
    );
    // Re-push the existing content as a fresh commit so GitHub re-evaluates merge state.
    await this.github.createOrUpdateFile({
      path: filePath,
      content,
      message: `Resolve conflict: keep my changes for ${filePath}`,
      branch: pr.branchName,
      sha: fileSha,
    });
  }

  async useMainOnConflict(prNumber: number): Promise<void> {
    // Semantically distinct intent ("accept the published version") but
    // mechanically identical to discard.
    await this.discardTopic(prNumber);
  }

  async submitMergedContent({
    prNumber,
    frontmatter,
    body,
  }: Parameters<ContentRepository["submitMergedContent"]>[0]): Promise<void> {
    const pr = await this.github.getPR(prNumber);
    const filePath = filePathFromBranch(pr.branchName);
    const mdxContent = serializeMdx(frontmatter, body);
    const { sha: fileSha } = await this.github.getFileContent(filePath, pr.branchName);
    await this.github.createOrUpdateFile({
      path: filePath,
      content: mdxContent,
      message: `Resolve conflict: manual edit for ${filePath}`,
      branch: pr.branchName,
      sha: fileSha,
    });
  }

  async createRoadmap({
    slug,
    title,
    description,
  }: Parameters<ContentRepository["createRoadmap"]>[0]): Promise<SubmissionRef> {
    const roadmapDir = `${CONTENT_DOCS_BASE}/${slug}`;

    try {
      await this.github.getDirectoryTree(roadmapDir);
      throw new ContentAlreadyExistsError(`Roadmap "${slug}" already exists`);
    } catch (err) {
      if (err instanceof ContentAlreadyExistsError) throw err;
      if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
    }

    const branchName = `content/roadmap-${slug}-${Date.now()}`;
    const mainSha = await this.github.getMainHeadSha();
    await this.github.createBranch(branchName, mainSha);

    const baseFm = { title, ...(description !== undefined ? { description } : {}) };

    await this.github.createOrUpdateFile({
      path: `${ROADMAP_META_BASE}/${slug}.mdx`,
      content: serializeMdx(baseFm, ""),
      message: `Create roadmap metadata: ${title}`,
      branch: branchName,
    });

    await this.github.createOrUpdateFile({
      path: `${roadmapDir}/index.mdx`,
      content: serializeMdx(baseFm, ""),
      message: `Create roadmap index: ${title}`,
      branch: branchName,
    });

    await this.github.createOrUpdateFile({
      path: `${roadmapDir}/meta.json`,
      content: JSON.stringify({ title, pages: ["index", "...rest"] }, null, 2) + "\n",
      message: `Create roadmap meta.json: ${title}`,
      branch: branchName,
    });

    await patchMetaPages(
      this.github,
      `${CONTENT_DOCS_BASE}/meta.json`,
      branchName,
      slug,
      `Add ${slug} to root meta.json`,
    );

    const pr = await this.github.createPullRequest({
      title: `New roadmap: ${title}`,
      body: `Created new roadmap: ${slug}`,
      head: branchName,
      base: "main",
    });

    try {
      await this.github.mergePullRequest(pr.number, "merge");
      await this.github.deleteBranch(branchName);
      this.github.invalidate.prefix(roadmapDir, "main");
      this.github.invalidate.file(`${CONTENT_DOCS_BASE}/meta.json`, "main");
      this.github.invalidate.file(`${ROADMAP_META_BASE}/${slug}.mdx`, "main");
      this.github.invalidate.tree(CONTENT_DOCS_BASE, "main");
    } catch {
      // Auto-merge may fail (branch protection etc.) — leave PR open.
    }

    return { prNumber: pr.number, branchName };
  }

  async createTrack({
    roadmap,
    trackSlug,
    trackTitle,
  }: Parameters<ContentRepository["createTrack"]>[0]): Promise<SubmissionRef> {
    const trackDir = `${CONTENT_DOCS_BASE}/${roadmap}/${trackSlug}`;

    try {
      await this.github.getDirectoryTree(trackDir);
      throw new ContentAlreadyExistsError(`Track "${trackSlug}" already exists`);
    } catch (err) {
      if (err instanceof ContentAlreadyExistsError) throw err;
      if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
    }

    const branchName = `content/${trackSlug}-${Date.now()}`;
    const mainSha = await this.github.getMainHeadSha();
    await this.github.createBranch(branchName, mainSha);

    await ensureRoadmapIndex(this.github, roadmap, roadmap, branchName);

    const normalizedTitle = trackTitle
      .split(" ")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");

    await this.github.createOrUpdateFile({
      path: `${trackDir}/index.mdx`,
      content: serializeMdx({ title: normalizedTitle, description: "" }, ""),
      message: `Create track index: ${normalizedTitle}`,
      branch: branchName,
    });

    await this.github.createOrUpdateFile({
      path: `${trackDir}/meta.json`,
      content: JSON.stringify({ title: normalizedTitle, pages: ["index"] }, null, 2) + "\n",
      message: `Create track meta.json: ${normalizedTitle}`,
      branch: branchName,
    });

    await patchMetaPages(
      this.github,
      `${CONTENT_DOCS_BASE}/${roadmap}/meta.json`,
      branchName,
      trackSlug,
      `Add ${trackSlug} to roadmap meta.json`,
    );

    const pr = await this.github.createPullRequest({
      title: `New track: ${normalizedTitle}`,
      body: `Created new track in ${roadmap}: ${normalizedTitle}`,
      head: branchName,
      base: "main",
    });

    try {
      await this.github.mergePullRequest(pr.number, "merge");
      await this.github.deleteBranch(branchName);
      this.github.invalidate.prefix(trackDir, "main");
      this.github.invalidate.file(`${CONTENT_DOCS_BASE}/${roadmap}/meta.json`, "main");
      this.github.invalidate.tree(`${CONTENT_DOCS_BASE}/${roadmap}`, "main");
    } catch {
      // Leave PR open if auto-merge fails.
    }

    return { prNumber: pr.number, branchName };
  }

  async createTopic(coords: ContentCoords): Promise<SubmissionRef> {
    const filePath = contentFilePath(coords);

    try {
      await this.github.getFileContent(filePath);
      throw new ContentAlreadyExistsError(`Topic "${coords.slug}" already exists`);
    } catch (err) {
      if (err instanceof ContentAlreadyExistsError) throw err;
      if (!(err instanceof Error) || !err.message.includes("not found")) throw err;
    }

    const defaultFrontmatter = { title: humanize(coords.slug) };
    const branchName = contentBranchName(coords);

    if (await this.github.branchExists(branchName)) {
      await this.github.deleteBranch(branchName);
    }
    const mainSha = await this.github.getMainHeadSha();
    await this.github.createBranch(branchName, mainSha);

    await ensureRoadmapIndex(this.github, coords.roadmap, coords.roadmap, branchName);

    await this.github.createOrUpdateFile({
      path: filePath,
      content: serializeMdx(defaultFrontmatter, ""),
      message: `Create new content: ${defaultFrontmatter.title}`,
      branch: branchName,
    });

    if (coords.track) {
      await patchMetaPages(
        this.github,
        `${CONTENT_DOCS_BASE}/${coords.roadmap}/${coords.track}/meta.json`,
        branchName,
        coords.slug,
        `Add ${coords.slug} to ${coords.track}/meta.json`,
      );
    }

    const pr = await this.github.createPullRequest({
      title: `New content: ${defaultFrontmatter.title}`,
      body: `Created new content file: ${filePath}`,
      head: branchName,
      base: "main",
    });

    return { prNumber: pr.number, branchName };
  }
}

/**
 * Cached singleton — mirrors the `getCachedGitHubService()` pattern.
 * Tests should construct their own OctokitContentRepository with a
 * stubbed GitHub service, or use FakeContentRepository instead.
 */
let singleton: OctokitContentRepository | undefined;

export function getContentRepository(): ContentRepository {
  if (!singleton) {
    singleton = new OctokitContentRepository(getCachedGitHubService());
  }
  return singleton;
}

/** Test helper — discard the singleton so the next call rebuilds it. */
export function resetContentRepositorySingleton(): void {
  singleton = undefined;
}
