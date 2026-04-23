/**
 * In-process caching layer around the GitHub service.
 *
 * - Reads are TTL-cached (20 min ± 20% jitter) with single-flight coalescing.
 * - Writes automatically invalidate the keys they obviously touched.
 * - Callers invalidate anything the wrapper can't infer (e.g. merged PRs
 *   landing files on main) via the exposed `invalidate` surface.
 *
 * Scope: single Bun process. If this ever runs multi-instance, swap the
 * backing store for something shared (Redis / Upstash).
 */

import { createGitHubService, type GitHubService } from "./github";

// ---------------------------------------------------------------------------
// Cache primitives
// ---------------------------------------------------------------------------

const BASE_TTL_MS = 20 * 60_000;
const JITTER_RATIO = 0.2;

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function nextExpiry(): number {
  const jitter = BASE_TTL_MS * JITTER_RATIO * (Math.random() * 2 - 1);
  return Date.now() + BASE_TTL_MS + jitter;
}

function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T): void {
  store.set(key, { value, expiresAt: nextExpiry() });
}

/**
 * Read-through cache with single-flight coalescing: if multiple callers request
 * the same key while it's being fetched, they all share the same promise.
 */
async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== undefined) return hit;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((value) => {
      setCached(key, value);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

const BRANCH_KEY = (branch?: string) => branch ?? "main";

const keys = {
  tree: (path: string, branch?: string) => `tree:${BRANCH_KEY(branch)}:${path}`,
  file: (path: string, branch?: string) => `file:${BRANCH_KEY(branch)}:${path}`,
  prList: () => `prs:content`,
  prBranch: (branchName: string) => `pr:branch:${branchName}`,
  prNum: (prNumber: number) => `pr:num:${prNumber}`,
  mainHead: () => `main:head`,
  commit: (branchName: string) => `commit:${branchName}`,
};

function parentDir(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function deleteKeysStartingWith(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Invalidation surface
// ---------------------------------------------------------------------------

export interface CacheInvalidator {
  /** Invalidate a single cached file on a given branch (defaults to main). */
  file(path: string, branch?: string): void;
  /** Invalidate a single cached directory listing on a given branch. */
  tree(path: string, branch?: string): void;
  /**
   * Invalidate every `file:` and `tree:` entry on `branch` (defaults to main)
   * whose path starts with `pathPrefix`.
   */
  prefix(pathPrefix: string, branch?: string): void;
  /** Invalidate the cached list of open content PRs. */
  prList(): void;
  /** Invalidate PR lookups keyed by branch name. */
  prBranch(branchName: string): void;
  /** Invalidate PR lookup keyed by PR number. */
  prNum(prNumber: number): void;
  /** Invalidate the cached main HEAD sha. */
  mainHead(): void;
  /**
   * Wipe every cache entry scoped to a given branch — file, tree, PR-by-branch,
   * and commit sha. Used when a branch is created or deleted.
   */
  branch(branchName: string): void;
  /** Clear everything. Useful for tests / manual ops. */
  all(): void;
}

function makeInvalidator(): CacheInvalidator {
  return {
    file(path, branch) {
      store.delete(keys.file(path, branch));
    },
    tree(path, branch) {
      store.delete(keys.tree(path, branch));
    },
    prefix(pathPrefix, branch) {
      const b = BRANCH_KEY(branch);
      deleteKeysStartingWith(`file:${b}:${pathPrefix}`);
      deleteKeysStartingWith(`tree:${b}:${pathPrefix}`);
    },
    prList() {
      store.delete(keys.prList());
    },
    prBranch(branchName) {
      store.delete(keys.prBranch(branchName));
    },
    prNum(prNumber) {
      store.delete(keys.prNum(prNumber));
    },
    mainHead() {
      store.delete(keys.mainHead());
    },
    branch(branchName) {
      deleteKeysStartingWith(`file:${branchName}:`);
      deleteKeysStartingWith(`tree:${branchName}:`);
      store.delete(keys.prBranch(branchName));
      store.delete(keys.commit(branchName));
    },
    all() {
      store.clear();
      inFlight.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Cached service
// ---------------------------------------------------------------------------

export interface CachedGitHubService extends GitHubService {
  invalidate: CacheInvalidator;
}

function wrap(raw: GitHubService): CachedGitHubService {
  const invalidate = makeInvalidator();

  // ---- Reads ----

  const getDirectoryTree: GitHubService["getDirectoryTree"] = (path, branch) =>
    withCache(keys.tree(path, branch), () => raw.getDirectoryTree(path, branch));

  const getFileContent: GitHubService["getFileContent"] = (path, branch) =>
    withCache(keys.file(path, branch), () => raw.getFileContent(path, branch));

  const listContentPRs: GitHubService["listContentPRs"] = () =>
    withCache(keys.prList(), () => raw.listContentPRs());

  const getPRByBranch: GitHubService["getPRByBranch"] = (branchName) =>
    withCache(keys.prBranch(branchName), () => raw.getPRByBranch(branchName));

  const getPR: GitHubService["getPR"] = (prNumber) =>
    withCache(keys.prNum(prNumber), () => raw.getPR(prNumber));

  const getMainHeadSha: GitHubService["getMainHeadSha"] = () =>
    withCache(keys.mainHead(), () => raw.getMainHeadSha());

  const getCommitSha: GitHubService["getCommitSha"] = (branchName) =>
    withCache(keys.commit(branchName), () => raw.getCommitSha(branchName));

  // `branchExists` and `compareCommits` stay uncached — branch existence is
  // typically checked right before a mutation (where stale "yes" would be bad),
  // and compareCommits is cheap + changes with main.

  // ---- Writes (auto-invalidate what they touched) ----

  const createOrUpdateFile: GitHubService["createOrUpdateFile"] = async (params) => {
    const result = await raw.createOrUpdateFile(params);
    invalidate.file(params.path, params.branch);
    invalidate.tree(parentDir(params.path), params.branch);
    return result;
  };

  const deleteFile: GitHubService["deleteFile"] = async (params) => {
    await raw.deleteFile(params);
    invalidate.file(params.path, params.branch);
    invalidate.tree(parentDir(params.path), params.branch);
  };

  const createBranch: GitHubService["createBranch"] = async (name, sha) => {
    await raw.createBranch(name, sha);
    invalidate.branch(name);
  };

  const deleteBranch: GitHubService["deleteBranch"] = async (name) => {
    await raw.deleteBranch(name);
    invalidate.branch(name);
  };

  const createPullRequest: GitHubService["createPullRequest"] = async (params) => {
    const result = await raw.createPullRequest(params);
    invalidate.prList();
    invalidate.prBranch(params.head);
    return result;
  };

  const updatePullRequest: GitHubService["updatePullRequest"] = async (params) => {
    await raw.updatePullRequest(params);
    invalidate.prList();
    invalidate.prNum(params.prNumber);
  };

  const mergePullRequest: GitHubService["mergePullRequest"] = async (prNumber, mergeMethod) => {
    await raw.mergePullRequest(prNumber, mergeMethod);
    invalidate.prList();
    invalidate.prNum(prNumber);
    invalidate.mainHead();
    // Note: the caller must invalidate the specific main-branch file/tree
    // paths that landed via this merge — the wrapper can't infer them from
    // `prNumber` alone.
  };

  const closePullRequest: GitHubService["closePullRequest"] = async (prNumber) => {
    await raw.closePullRequest(prNumber);
    invalidate.prList();
    invalidate.prNum(prNumber);
  };

  return {
    getDirectoryTree,
    getFileContent,
    getMainHeadSha,
    createBranch,
    deleteBranch,
    branchExists: raw.branchExists,
    createOrUpdateFile,
    deleteFile,
    listContentPRs,
    getPRByBranch,
    getPR,
    createPullRequest,
    updatePullRequest,
    mergePullRequest,
    closePullRequest,
    getCommitSha,
    compareCommits: raw.compareCommits,
    invalidate,
  };
}

// ---------------------------------------------------------------------------
// Module singleton
// ---------------------------------------------------------------------------

let instance: CachedGitHubService | null = null;

/**
 * Get the module-scoped cached GitHub service. The underlying Octokit client
 * and cache are shared across all callers in this process.
 */
export function getCachedGitHubService(): CachedGitHubService {
  if (!instance) {
    instance = wrap(createGitHubService());
  }
  return instance;
}
