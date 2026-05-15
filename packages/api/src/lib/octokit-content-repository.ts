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
  ContentNotFoundError,
  type ConflictStatus,
  type ContentRepository,
  type SubmissionRef,
  type SubmitTopicEditResult,
} from "./content-repository";

export {
  ContentAlreadyExistsError,
  ContentMergeConflictError,
  ContentNotFoundError,
};

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
      if (entry.type === "file") files.push(entry.path);
      else if (entry.type === "dir") queue.push(entry.path);
    }
  }
  return files;
}

async function patchMetaRemovePage(
  github: GitHubService,
  metaPath: string,
  branch: string,
  page: string,
  commitMessage: string,
): Promise<void> {
  try {
    const { content: rawMeta, sha: metaSha } = await github.getFileContent(metaPath, branch);
    const updated = removePageFromMeta(rawMeta, page);
    if (!updated) return;
    await github.createOrUpdateFile({
      path: metaPath,
      content: updated,
      message: commitMessage,
      branch,
      sha: metaSha,
    });
  } catch {
    // missing or invalid meta.json → skip (matches previous behaviour)
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

  async deleteTopic(coords: ContentCoords): Promise<void> {
    const filePath = contentFilePath(coords);

    let fileSha: string;
    try {
      ({ sha: fileSha } = await this.github.getFileContent(filePath, "main"));
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw new ContentNotFoundError(`Topic "${coords.slug}" not found`);
      }
      throw err;
    }

    await this.github.deleteFile({
      path: filePath,
      message: `Delete content: ${coords.slug}`,
      branch: "main",
      sha: fileSha,
    });

    const metaPath = coords.track
      ? `${CONTENT_DOCS_BASE}/${coords.roadmap}/${coords.track}/meta.json`
      : `${CONTENT_DOCS_BASE}/${coords.roadmap}/meta.json`;
    await patchMetaRemovePage(
      this.github,
      metaPath,
      "main",
      coords.slug,
      `Remove ${coords.slug} from meta.json`,
    );

    this.github.invalidate.file(filePath, "main");
    this.github.invalidate.file(metaPath, "main");
  }

  async deleteTrack({
    roadmap,
    trackSlug,
  }: Parameters<ContentRepository["deleteTrack"]>[0]): Promise<{ deletedFiles: number }> {
    const trackDir = `${CONTENT_DOCS_BASE}/${roadmap}/${trackSlug}`;

    try {
      await this.github.getDirectoryTree(trackDir, "main");
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw new ContentNotFoundError(`Track "${trackSlug}" not found`);
      }
      throw err;
    }

    const trackFiles = await listFilesRecursively(this.github, trackDir, "main");
    for (const filePath of trackFiles.sort((a, b) => b.length - a.length)) {
      const { sha } = await this.github.getFileContent(filePath, "main");
      await this.github.deleteFile({
        path: filePath,
        message: `Delete track file: ${filePath}`,
        branch: "main",
        sha,
      });
    }

    await patchMetaRemovePage(
      this.github,
      `${CONTENT_DOCS_BASE}/${roadmap}/meta.json`,
      "main",
      trackSlug,
      `Remove track ${trackSlug} from roadmap meta.json`,
    );

    this.github.invalidate.prefix(trackDir, "main");
    this.github.invalidate.tree(`${CONTENT_DOCS_BASE}/${roadmap}`, "main");

    return { deletedFiles: trackFiles.length };
  }

  async deleteRoadmap(slug: string): Promise<{ deletedFiles: number }> {
    const roadmapDir = `${CONTENT_DOCS_BASE}/${slug}`;

    try {
      await this.github.getDirectoryTree(roadmapDir, "main");
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw new ContentNotFoundError(`Roadmap "${slug}" not found`);
      }
      throw err;
    }

    const roadmapFiles = await listFilesRecursively(this.github, roadmapDir, "main");
    for (const filePath of roadmapFiles.sort((a, b) => b.length - a.length)) {
      const { sha } = await this.github.getFileContent(filePath, "main");
      await this.github.deleteFile({
        path: filePath,
        message: `Delete roadmap file: ${filePath}`,
        branch: "main",
        sha,
      });
    }

    const roadmapMetaPath = `${ROADMAP_META_BASE}/${slug}.mdx`;
    try {
      const { sha } = await this.github.getFileContent(roadmapMetaPath, "main");
      await this.github.deleteFile({
        path: roadmapMetaPath,
        message: `Delete roadmap metadata: ${slug}`,
        branch: "main",
        sha,
      });
    } catch {
      // metadata file may not exist — skip
    }

    await patchMetaRemovePage(
      this.github,
      `${CONTENT_DOCS_BASE}/meta.json`,
      "main",
      slug,
      `Remove roadmap ${slug} from root meta.json`,
    );

    this.github.invalidate.prefix(roadmapDir, "main");
    this.github.invalidate.tree(CONTENT_DOCS_BASE, "main");
    this.github.invalidate.tree(ROADMAP_META_BASE, "main");

    return { deletedFiles: roadmapFiles.length };
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
