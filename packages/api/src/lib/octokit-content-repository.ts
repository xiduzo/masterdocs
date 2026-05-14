/**
 * Production ContentRepository adapter — wraps the GitHub-backed
 * CachedGitHubService and implements the domain verbs.
 *
 * Currently covers the Submission lifecycle slice (submit/publish/
 * discard). Other slices will be added as `content.ts` is migrated.
 */

import {
  contentBranchName,
  contentFilePath,
  filePathFromBranch,
} from "./content-paths";
import {
  type CachedGitHubService,
  getCachedGitHubService,
} from "./github-cache";
import { serializeMdx } from "./mdx";
import {
  ContentMergeConflictError,
  type ConflictStatus,
  type ContentRepository,
  type SubmitTopicEditResult,
} from "./content-repository";

export { ContentMergeConflictError };

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
