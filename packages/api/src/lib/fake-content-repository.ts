/**
 * In-memory ContentRepository — for unit tests.
 *
 * Implements just enough of the GitHub-backed semantics for the
 * Submission lifecycle slice (submit/publish/discard) to verify the
 * router and any other repository consumer. Test helpers (`mainFiles`,
 * `pendingPRs`, `simulateMergeConflict`, …) hang off the class so
 * suites can assert on observable state.
 */

import { contentBranchName, contentFilePath } from "./content-paths";
import { serializeMdx } from "./mdx";
import {
  ContentMergeConflictError,
  type ContentCoords,
  type ContentRepository,
  type SubmitTopicEditResult,
} from "./content-repository";

interface BranchFile {
  path: string;
  content: string;
  sha: string;
}

interface PendingPR {
  prNumber: number;
  branchName: string;
  file: BranchFile;
}

export class FakeContentRepository implements ContentRepository {
  private nextPrNumber = 1;
  private nextShaCounter = 1;
  private readonly main = new Map<string, BranchFile>();
  private readonly prs = new Map<number, PendingPR>();
  private readonly prsByBranch = new Map<string, PendingPR>();
  /** When true, the next `publishTopic` call throws ContentMergeConflictError. */
  public simulateMergeConflict = false;

  private fakeSha(): string {
    return `sha-${this.nextShaCounter++}`;
  }

  // ── Repository interface ─────────────────────────────────────────────────

  async submitTopicEdit({
    coords,
    frontmatter,
    body,
  }: Parameters<ContentRepository["submitTopicEdit"]>[0]): Promise<SubmitTopicEditResult> {
    const filePath = contentFilePath(coords);
    const branchName = contentBranchName(coords);
    const mdx = serializeMdx(frontmatter, body);

    const existing = this.prsByBranch.get(branchName);
    if (existing) {
      existing.file = {
        path: filePath,
        content: mdx,
        sha: this.fakeSha(),
      };
      return {
        prNumber: existing.prNumber,
        branchName: existing.branchName,
        isNew: false,
      };
    }

    const pr: PendingPR = {
      prNumber: this.nextPrNumber++,
      branchName,
      file: {
        path: filePath,
        content: mdx,
        sha: this.fakeSha(),
      },
    };
    this.prs.set(pr.prNumber, pr);
    this.prsByBranch.set(pr.branchName, pr);
    return { prNumber: pr.prNumber, branchName: pr.branchName, isNew: true };
  }

  async publishTopic(prNumber: number): Promise<void> {
    const pr = this.prs.get(prNumber);
    if (!pr) throw new Error(`No such PR: ${prNumber}`);

    if (this.simulateMergeConflict) {
      this.simulateMergeConflict = false;
      throw new ContentMergeConflictError();
    }

    // "Merge" — copy the branch file onto main.
    this.main.set(pr.file.path, {
      path: pr.file.path,
      content: pr.file.content,
      sha: this.fakeSha(),
    });
    this.prs.delete(pr.prNumber);
    this.prsByBranch.delete(pr.branchName);
  }

  async discardTopic(prNumber: number): Promise<void> {
    const pr = this.prs.get(prNumber);
    if (!pr) throw new Error(`No such PR: ${prNumber}`);
    this.prs.delete(pr.prNumber);
    this.prsByBranch.delete(pr.branchName);
  }

  // ── Test helpers ─────────────────────────────────────────────────────────

  /** All currently open Submissions. */
  pendingPRs(): PendingPR[] {
    return [...this.prs.values()];
  }

  /** All files merged to `main`. */
  mainFiles(): BranchFile[] {
    return [...this.main.values()];
  }

  /** Preload a file as if it had been merged previously. */
  seedMainFile(coords: ContentCoords, content: string): void {
    const path = contentFilePath(coords);
    this.main.set(path, {
      path,
      content,
      sha: this.fakeSha(),
    });
  }
}
