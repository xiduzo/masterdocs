import { Octokit } from "@octokit/rest";
import { env } from "@masterdocs/env/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  sha: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
}

export interface GitHubService {
  // Tree operations
  getDirectoryTree(path: string, branch?: string): Promise<TreeEntry[]>;
  getFileContent(
    path: string,
    branch?: string,
  ): Promise<{ content: string; sha: string }>;

  // Branch operations
  getMainHeadSha(): Promise<string>;
  createBranch(name: string, sha: string): Promise<void>;
  deleteBranch(name: string): Promise<void>;

  // Commit operations
  createOrUpdateFile(params: {
    path: string;
    content: string;
    message: string;
    branch: string;
    sha?: string;
  }): Promise<{ sha: string }>;

  // PR operations
  createPullRequest(params: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ number: number }>;
  updatePullRequest(params: { prNumber: number; title: string }): Promise<void>;
  mergePullRequest(prNumber: number, mergeMethod: "merge"): Promise<void>;
  closePullRequest(prNumber: number): Promise<void>;

  // Conflict detection
  getCommitSha(branch: string): Promise<string>;
  compareCommits(
    base: string,
    head: string,
  ): Promise<{ files: ChangedFile[] }>;
}

// ---------------------------------------------------------------------------
// Error handling helpers
// ---------------------------------------------------------------------------

function isRateLimited(status: number, headers: Record<string, unknown>): boolean {
  if (status === 429) return true;
  if (status === 403 && headers["x-ratelimit-remaining"] === "0") return true;
  return false;
}

function wrapOctokitError(err: unknown): never {
  if (!(err instanceof Error)) throw err;

  // Octokit errors expose `status` and `response`
  const status = (err as { status?: number }).status;
  const headers = (err as { response?: { headers?: Record<string, unknown> } })
    .response?.headers ?? {};

  if (status !== undefined) {
    // Rate limiting (check before 403 to avoid masking)
    if (isRateLimited(status, headers)) {
      const retryAfter = headers["retry-after"] ?? "unknown";
      throw new Error(
        `GitHub API rate limit exceeded — retry after ${retryAfter}s`,
      );
    }

    switch (status) {
      case 401:
        throw new Error(
          "GitHub authentication failed — check GITHUB_TOKEN",
        );
      case 403:
        throw new Error("GitHub token lacks required permissions");
      case 404:
        throw new Error(`GitHub resource not found: ${err.message}`);
      case 409:
        throw new Error(`GitHub conflict: ${err.message}`);
      case 422:
        throw new Error(`GitHub validation failed: ${err.message}`);
    }
  }

  // Network / generic errors
  if (
    err.message.includes("fetch failed") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ENOTFOUND") ||
    err.message.includes("getaddrinfo")
  ) {
    throw new Error("Unable to reach GitHub");
  }

  throw err;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGitHubService(): GitHubService {
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error(
      "GitHub configuration missing — set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables",
    );
  }

  const octokit = new Octokit({ auth: token });

  // -----------------------------------------------------------------------
  // Tree operations
  // -----------------------------------------------------------------------

  async function getDirectoryTree(
    path: string,
    branch?: string,
  ): Promise<TreeEntry[]> {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });

      if (!Array.isArray(data)) {
        throw new Error(`Path "${path}" is not a directory`);
      }

      return data.map((item) => ({
        path: item.path,
        type: item.type === "dir" ? "dir" : "file",
        sha: item.sha,
      }));
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function getFileContent(
    path: string,
    branch?: string,
  ): Promise<{ content: string; sha: string }> {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });

      if (Array.isArray(data) || data.type !== "file") {
        throw new Error(`Path "${path}" is not a file`);
      }

      // GitHub returns base64-encoded content for files
      const content = Buffer.from(
        (data as { content: string }).content,
        "base64",
      ).toString("utf-8");

      return { content, sha: data.sha };
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  // -----------------------------------------------------------------------
  // Branch operations
  // -----------------------------------------------------------------------

  async function getMainHeadSha(): Promise<string> {
    try {
      const { data } = await octokit.git.getRef({
        owner,
        repo,
        ref: "heads/main",
      });
      return data.object.sha;
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function createBranch(name: string, sha: string): Promise<void> {
    try {
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${name}`,
        sha,
      });
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function deleteBranch(name: string): Promise<void> {
    try {
      await octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${name}`,
      });
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  // -----------------------------------------------------------------------
  // Commit operations
  // -----------------------------------------------------------------------

  async function createOrUpdateFile(params: {
    path: string;
    content: string;
    message: string;
    branch: string;
    sha?: string;
  }): Promise<{ sha: string }> {
    try {
      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: params.path,
        message: params.message,
        content: Buffer.from(params.content).toString("base64"),
        branch: params.branch,
        ...(params.sha ? { sha: params.sha } : {}),
      });
      return { sha: data.content?.sha ?? "" };
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  // -----------------------------------------------------------------------
  // PR operations
  // -----------------------------------------------------------------------

  async function createPullRequest(params: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ number: number }> {
    try {
      const { data } = await octokit.pulls.create({
        owner,
        repo,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
      });
      return { number: data.number };
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function mergePullRequest(
    prNumber: number,
    mergeMethod: "merge",
  ): Promise<void> {
    try {
      await octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function updatePullRequest(params: {
    prNumber: number;
    title: string;
  }): Promise<void> {
    try {
      await octokit.pulls.update({
        owner,
        repo,
        pull_number: params.prNumber,
        title: params.title,
      });
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function closePullRequest(prNumber: number): Promise<void> {
    try {
      await octokit.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        state: "closed",
      });
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  // -----------------------------------------------------------------------
  // Conflict detection
  // -----------------------------------------------------------------------

  async function getCommitSha(branch: string): Promise<string> {
    try {
      const { data } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      return data.object.sha;
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  async function compareCommits(
    base: string,
    head: string,
  ): Promise<{ files: ChangedFile[] }> {
    try {
      const { data } = await octokit.repos.compareCommits({
        owner,
        repo,
        base,
        head,
      });

      const files: ChangedFile[] = (data.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status ?? "unknown",
      }));

      return { files };
    } catch (err) {
      return wrapOctokitError(err);
    }
  }

  // -----------------------------------------------------------------------
  // Return service object
  // -----------------------------------------------------------------------

  return {
    getDirectoryTree,
    getFileContent,
    getMainHeadSha,
    createBranch,
    deleteBranch,
    createOrUpdateFile,
    createPullRequest,
    updatePullRequest,
    mergePullRequest,
    closePullRequest,
    getCommitSha,
    compareCommits,
  };
}
