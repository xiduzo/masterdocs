/**
 * ContentRepository — the deep module behind which every Roadmap/Track/
 * Topic mutation routes. See CONTEXT.md for the architectural overview.
 *
 * Each verb is phrased in the domain language. GitHub branch/PR
 * mechanics, file-path construction, MDX serialization, and cache
 * invalidation are all the repository's concern — callers (the tRPC
 * router, tests) speak only Topics and Submissions.
 *
 * Current surface covers the **Submission lifecycle** slice
 * (submit/publish/discard). Subsequent slices will extend this
 * interface to cover create, delete, reorder, conflict resolution,
 * and reads.
 */

import type { MdxFrontmatter } from "./mdx";
import type { ContentCoords } from "./content-paths";

export type { ContentCoords } from "./content-paths";

/** A reference to an open Submission — the PR + branch backing a pending Topic edit. */
export interface SubmissionRef {
  prNumber: number;
  branchName: string;
}

export interface SubmitTopicEditResult extends SubmissionRef {
  /** True if a new Submission was created; false if an existing one was updated. */
  isNew: boolean;
}

export interface ContentRepository {
  /**
   * Submit a Topic edit. Creates a Submission (branch + PR) if none
   * exists for these coordinates; otherwise updates the existing one
   * with the new content.
   *
   * `fileSha` is the SHA of the file revision the edit was based on.
   * It is used as the optimistic-locking sha when creating the file in
   * a fresh Submission. When updating an existing Submission the current
   * branch-tip sha is fetched and used.
   */
  submitTopicEdit(params: {
    coords: ContentCoords;
    frontmatter: MdxFrontmatter;
    body: string;
    fileSha?: string;
  }): Promise<SubmitTopicEditResult>;

  /**
   * Publish a Submission — merge its PR into main, delete the branch,
   * and evict any cache entries that referenced the file.
   *
   * Throws on merge conflict (the caller is expected to surface this
   * via the conflict-resolution flow).
   */
  publishTopic(prNumber: number): Promise<void>;

  /** Discard a Submission — close the PR and delete its branch. */
  discardTopic(prNumber: number): Promise<void>;
}

/**
 * Tagged error raised by `publishTopic` when GitHub reports a merge
 * conflict. The tRPC router catches this and surfaces it as a
 * `TRPCError({ code: "CONFLICT" })`.
 */
export class ContentMergeConflictError extends Error {
  readonly name = "ContentMergeConflictError";
  constructor() {
    super("Merge conflict detected");
  }
}
