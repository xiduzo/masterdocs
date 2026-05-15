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
  ContentAlreadyExistsError,
  ContentMergeConflictError,
  ContentNotFoundError,
  type ConflictStatus,
  type ContentCoords,
  type ContentRepository,
  type SubmissionRef,
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
  private mainShaCounter = 1;
  private currentMainSha = `main-sha-${this.mainShaCounter}`;
  private readonly main = new Map<string, BranchFile>();
  private readonly prs = new Map<number, PendingPR>();
  private readonly prsByBranch = new Map<string, PendingPR>();
  /** Main HEAD sha captured when each Submission opened. */
  private readonly prBaseSha = new Map<number, string>();
  /** File paths modified on main since each Submission opened. */
  private readonly prMainModifiedFiles = new Map<number, Set<string>>();
  /** When true, the next `publishTopic` call throws ContentMergeConflictError. */
  public simulateMergeConflict = false;

  private fakeSha(): string {
    return `sha-${this.nextShaCounter++}`;
  }

  private advanceMainSha(): void {
    this.currentMainSha = `main-sha-${++this.mainShaCounter}`;
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
    this.prBaseSha.set(pr.prNumber, this.currentMainSha);
    this.prMainModifiedFiles.set(pr.prNumber, new Set());
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
    this.prBaseSha.delete(pr.prNumber);
    this.prMainModifiedFiles.delete(pr.prNumber);
  }

  async checkConflict(prNumber: number): Promise<ConflictStatus> {
    const pr = this.prs.get(prNumber);
    if (!pr) throw new Error(`No such PR: ${prNumber}`);
    const baseSha = this.prBaseSha.get(prNumber)!;
    const mainAdvanced = baseSha !== this.currentMainSha;
    if (!mainAdvanced) {
      return { hasConflict: false, mainAdvanced: false, currentMainSha: this.currentMainSha };
    }
    const modified = this.prMainModifiedFiles.get(prNumber)!;
    return {
      hasConflict: modified.has(pr.file.path),
      mainAdvanced: true,
      currentMainSha: this.currentMainSha,
    };
  }

  async keepMineOnConflict(prNumber: number): Promise<void> {
    const pr = this.prs.get(prNumber);
    if (!pr) throw new Error(`No such PR: ${prNumber}`);
    // Re-push: bump the file sha as if a fresh commit landed.
    pr.file.sha = this.fakeSha();
  }

  async useMainOnConflict(prNumber: number): Promise<void> {
    await this.discardTopic(prNumber);
  }

  async submitMergedContent({
    prNumber,
    frontmatter,
    body,
  }: Parameters<ContentRepository["submitMergedContent"]>[0]): Promise<void> {
    const pr = this.prs.get(prNumber);
    if (!pr) throw new Error(`No such PR: ${prNumber}`);
    pr.file.content = serializeMdx(frontmatter, body);
    pr.file.sha = this.fakeSha();
  }

  async createRoadmap({
    slug,
    title,
    description,
  }: Parameters<ContentRepository["createRoadmap"]>[0]): Promise<SubmissionRef> {
    if (this.roadmapExistsOnMain(slug)) {
      throw new ContentAlreadyExistsError(`Roadmap "${slug}" already exists`);
    }
    const branchName = `content/roadmap-${slug}-${this.nextPrNumber}`;
    const baseFm = { title, ...(description !== undefined ? { description } : {}) };

    // Auto-merge: write the scaffold straight to main.
    const indexPath = `apps/fumadocs/content/docs/${slug}/index.mdx`;
    const metaPath = `apps/fumadocs/content/docs/${slug}/meta.json`;
    const roadmapMdxPath = `apps/fumadocs/content/roadmaps/${slug}.mdx`;

    this.main.set(roadmapMdxPath, {
      path: roadmapMdxPath,
      content: serializeMdx(baseFm, ""),
      sha: this.fakeSha(),
    });
    this.main.set(indexPath, {
      path: indexPath,
      content: serializeMdx(baseFm, ""),
      sha: this.fakeSha(),
    });
    this.main.set(metaPath, {
      path: metaPath,
      content: JSON.stringify({ title, pages: ["index", "...rest"] }, null, 2) + "\n",
      sha: this.fakeSha(),
    });

    const prNumber = this.nextPrNumber++;
    return { prNumber, branchName };
  }

  async createTrack({
    roadmap,
    trackSlug,
    trackTitle,
  }: Parameters<ContentRepository["createTrack"]>[0]): Promise<SubmissionRef> {
    if (this.trackExistsOnMain(roadmap, trackSlug)) {
      throw new ContentAlreadyExistsError(`Track "${trackSlug}" already exists`);
    }
    const branchName = `content/${trackSlug}-${this.nextPrNumber}`;
    const indexPath = `apps/fumadocs/content/docs/${roadmap}/${trackSlug}/index.mdx`;
    const metaPath = `apps/fumadocs/content/docs/${roadmap}/${trackSlug}/meta.json`;

    this.main.set(indexPath, {
      path: indexPath,
      content: serializeMdx({ title: trackTitle, description: "" }, ""),
      sha: this.fakeSha(),
    });
    this.main.set(metaPath, {
      path: metaPath,
      content: JSON.stringify({ title: trackTitle, pages: ["index"] }, null, 2) + "\n",
      sha: this.fakeSha(),
    });

    const prNumber = this.nextPrNumber++;
    return { prNumber, branchName };
  }

  async createTopic(coords: ContentCoords): Promise<SubmissionRef> {
    const filePath = contentFilePath(coords);
    if (this.main.has(filePath)) {
      throw new ContentAlreadyExistsError(`Topic "${coords.slug}" already exists`);
    }

    const branchName = contentBranchName(coords);
    const defaultFrontmatter = {
      title: coords.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    };

    // Existing pending PR on this branch is rare here (caller checks main),
    // but mirror the production adapter's clean-up.
    if (this.prsByBranch.has(branchName)) {
      const existing = this.prsByBranch.get(branchName)!;
      this.prs.delete(existing.prNumber);
      this.prsByBranch.delete(existing.branchName);
    }

    const pr: PendingPR = {
      prNumber: this.nextPrNumber++,
      branchName,
      file: {
        path: filePath,
        content: serializeMdx(defaultFrontmatter, ""),
        sha: this.fakeSha(),
      },
    };
    this.prs.set(pr.prNumber, pr);
    this.prsByBranch.set(pr.branchName, pr);
    this.prBaseSha.set(pr.prNumber, this.currentMainSha);
    this.prMainModifiedFiles.set(pr.prNumber, new Set());
    return { prNumber: pr.prNumber, branchName: pr.branchName };
  }

  async deleteTopic(coords: ContentCoords): Promise<void> {
    const filePath = contentFilePath(coords);
    if (!this.main.has(filePath)) {
      throw new ContentNotFoundError(`Topic "${coords.slug}" not found`);
    }
    this.main.delete(filePath);
  }

  async deleteTrack({
    roadmap,
    trackSlug,
  }: Parameters<ContentRepository["deleteTrack"]>[0]): Promise<{ deletedFiles: number }> {
    const prefix = `apps/fumadocs/content/docs/${roadmap}/${trackSlug}/`;
    const targets = [...this.main.keys()].filter((p) => p.startsWith(prefix));
    if (targets.length === 0) {
      throw new ContentNotFoundError(`Track "${trackSlug}" not found`);
    }
    for (const p of targets) this.main.delete(p);
    return { deletedFiles: targets.length };
  }

  async reorderTracksInRoadmap({
    roadmap,
    orderedTrackSlugs,
  }: Parameters<ContentRepository["reorderTracksInRoadmap"]>[0]): Promise<void> {
    const metaPath = `apps/fumadocs/content/docs/${roadmap}/meta.json`;
    this.reorderMetaJsonPagesInPlace(metaPath, orderedTrackSlugs);
  }

  async reorderTopicsInTrack({
    roadmap,
    trackSlug,
    orderedTopicSlugs,
  }: Parameters<ContentRepository["reorderTopicsInTrack"]>[0]): Promise<void> {
    const metaPath = `apps/fumadocs/content/docs/${roadmap}/${trackSlug}/meta.json`;
    this.reorderMetaJsonPagesInPlace(metaPath, orderedTopicSlugs);
  }

  private reorderMetaJsonPagesInPlace(
    metaPath: string,
    orderedSlugs: string[],
  ): void {
    const file = this.main.get(metaPath);
    if (!file) return;
    let meta: { title?: string; pages?: string[] };
    try {
      meta = JSON.parse(file.content);
    } catch {
      return;
    }
    if (!Array.isArray(meta.pages)) return;

    const filteredOrdered = orderedSlugs.filter((s) => s !== "index");
    const remaining = meta.pages.filter(
      (p) => p !== "index" && !filteredOrdered.includes(p),
    );
    const newPages = ["index", ...filteredOrdered, ...remaining];
    if (JSON.stringify(meta.pages) === JSON.stringify(newPages)) return;

    meta.pages = newPages;
    this.main.set(metaPath, {
      path: metaPath,
      content: JSON.stringify(meta, null, 2) + "\n",
      sha: this.fakeSha(),
    });
  }

  async deleteRoadmap(slug: string): Promise<{ deletedFiles: number }> {
    const docsPrefix = `apps/fumadocs/content/docs/${slug}/`;
    const docsTargets = [...this.main.keys()].filter((p) =>
      p.startsWith(docsPrefix),
    );
    const roadmapMdxPath = `apps/fumadocs/content/roadmaps/${slug}.mdx`;
    const roadmapMdxExists = this.main.has(roadmapMdxPath);
    if (docsTargets.length === 0 && !roadmapMdxExists) {
      throw new ContentNotFoundError(`Roadmap "${slug}" not found`);
    }
    for (const p of docsTargets) this.main.delete(p);
    if (roadmapMdxExists) this.main.delete(roadmapMdxPath);
    return { deletedFiles: docsTargets.length };
  }

  private roadmapExistsOnMain(slug: string): boolean {
    const prefix = `apps/fumadocs/content/docs/${slug}/`;
    for (const path of this.main.keys()) {
      if (path.startsWith(prefix)) return true;
    }
    return false;
  }

  private trackExistsOnMain(roadmap: string, trackSlug: string): boolean {
    const prefix = `apps/fumadocs/content/docs/${roadmap}/${trackSlug}/`;
    for (const path of this.main.keys()) {
      if (path.startsWith(prefix)) return true;
    }
    return false;
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

  /**
   * Simulate `main` advancing for unrelated reasons (some other PR
   * merged). All open Submissions will see `mainAdvanced: true` on
   * their next checkConflict, but `hasConflict: false` unless the
   * specific Topic file was also touched.
   */
  advanceMainUnrelated(): void {
    this.advanceMainSha();
  }

  /**
   * Simulate `main` advancing AND modifying the Topic file behind the
   * given Submission. Subsequent checkConflict will return
   * `hasConflict: true`.
   */
  simulateConflictingMainEdit(prNumber: number): void {
    const pr = this.prs.get(prNumber);
    if (!pr) throw new Error(`No such PR: ${prNumber}`);
    this.advanceMainSha();
    this.prMainModifiedFiles.get(prNumber)?.add(pr.file.path);
  }
}
