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

  /**
   * Inspect whether a Submission's base branch has advanced on main, and
   * whether that advance touched the target Topic file.
   */
  checkConflict(prNumber: number): Promise<ConflictStatus>;

  /**
   * Resolve a conflict by re-pushing the Submission's own file content
   * (forces a fresh merge attempt). The PR stays open.
   */
  keepMineOnConflict(prNumber: number): Promise<void>;

  /**
   * Resolve a conflict by accepting the version of the Topic currently
   * on main. Closes the Submission — semantically equivalent to discard,
   * but expressed with the intent the operator selected in the UI.
   */
  useMainOnConflict(prNumber: number): Promise<void>;

  /**
   * Resolve a conflict by submitting a manually-merged version of the
   * Topic. Rewrites the Submission's file with the new MDX; the PR stays
   * open for re-merge.
   */
  submitMergedContent(params: {
    prNumber: number;
    frontmatter: MdxFrontmatter;
    body: string;
  }): Promise<void>;

  /**
   * Create a brand-new Roadmap — scaffolds the directory, metadata
   * mdx, index mdx, meta.json, and patches the root meta.json. Auto-
   * merges so the Roadmap appears immediately. Throws
   * ContentAlreadyExistsError if a Roadmap with this slug exists.
   */
  createRoadmap(params: {
    slug: string;
    title: string;
    description?: string;
  }): Promise<SubmissionRef>;

  /**
   * Create a new Track inside an existing Roadmap — scaffolds the
   * track directory with an index.mdx + meta.json and patches the
   * Roadmap's meta.json. Auto-merges. Throws ContentAlreadyExistsError
   * if the Track exists.
   */
  createTrack(params: {
    roadmap: string;
    trackSlug: string;
    trackTitle: string;
  }): Promise<SubmissionRef>;

  /**
   * Create a new Topic inside a Track — opens a Submission containing
   * the new file with default frontmatter; **does not** auto-merge.
   * The Topic is in `pending_review` state until publish. Throws
   * ContentAlreadyExistsError if the Topic exists on main.
   */
  createTopic(coords: ContentCoords): Promise<SubmissionRef>;

  /**
   * Delete a single Topic on main. Patches the parent Track's
   * meta.json. Topic index files are not deletable through this verb —
   * the caller is expected to call deleteTrack or deleteRoadmap instead.
   */
  deleteTopic(coords: ContentCoords): Promise<void>;

  /**
   * Delete an entire Track recursively, including its files and
   * meta.json. Patches the Roadmap's meta.json. Returns the count of
   * deleted files. Throws ContentNotFoundError if the Track is missing.
   */
  deleteTrack(params: {
    roadmap: string;
    trackSlug: string;
  }): Promise<{ deletedFiles: number }>;

  /**
   * Delete an entire Roadmap recursively. Removes content/docs/<slug>/,
   * content/roadmaps/<slug>.mdx, and patches the root meta.json.
   * Returns the count of deleted files. Throws ContentNotFoundError if
   * the Roadmap is missing.
   */
  deleteRoadmap(slug: string): Promise<{ deletedFiles: number }>;

  /**
   * Reorder the Tracks of a Roadmap. Rewrites `meta.json.pages` in
   * `content/docs/<roadmap>/meta.json` directly on main, keeping any
   * track entries not present in `orderedTrackSlugs` at the end. The
   * `index` entry is always pinned first. No-op if the order has not
   * changed.
   */
  reorderTracksInRoadmap(params: {
    roadmap: string;
    orderedTrackSlugs: string[];
  }): Promise<void>;

  /**
   * Reorder the Topics within a Track. Rewrites `meta.json.pages` in
   * `content/docs/<roadmap>/<track>/meta.json` directly on main, with
   * the same index-pinned + trailing-leftover semantics as
   * `reorderTracksInRoadmap`.
   */
  reorderTopicsInTrack(params: {
    roadmap: string;
    trackSlug: string;
    orderedTopicSlugs: string[];
  }): Promise<void>;
}

export interface ConflictStatus {
  /** True if the Topic file was modified on main since the Submission opened. */
  hasConflict: boolean;
  /** True if main has advanced at all since the Submission opened, regardless of conflict. */
  mainAdvanced: boolean;
  /** Current main HEAD sha. */
  currentMainSha: string;
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

/**
 * Tagged error raised by create* verbs when the target resource (Roadmap,
 * Track, or Topic) already exists. The tRPC router surfaces this as a
 * `TRPCError({ code: "CONFLICT" })`.
 */
export class ContentAlreadyExistsError extends Error {
  readonly name = "ContentAlreadyExistsError";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Tagged error raised by delete* verbs when the target resource is
 * missing. The tRPC router surfaces this as a
 * `TRPCError({ code: "NOT_FOUND" })`.
 */
export class ContentNotFoundError extends Error {
  readonly name = "ContentNotFoundError";
  constructor(message: string) {
    super(message);
  }
}
