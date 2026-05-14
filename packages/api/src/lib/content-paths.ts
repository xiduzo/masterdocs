/**
 * Path conventions for Roadmap content stored in the fumadocs content tree.
 *
 * The Roadmap/Track/Topic hierarchy is encoded in the filesystem path
 * (see docs/adr/0001-content-structure-source.md). These helpers are the
 * single source of truth for translating coordinates ↔ file paths ↔
 * Submission branch names.
 */

export const CONTENT_DOCS_BASE = "apps/fumadocs/content/docs";
export const ROADMAP_META_BASE = "apps/fumadocs/content/roadmaps";

export interface ContentCoords {
  roadmap: string;
  slug: string;
  track?: string;
}

/** Deterministic Submission branch name for a Topic. */
export function contentBranchName(coords: ContentCoords): string {
  return coords.track
    ? `content/${coords.roadmap}/${coords.track}/${coords.slug}`
    : `content/${coords.roadmap}/${coords.slug}`;
}

/** Reverse of `contentBranchName` — full file path from a Submission branch. */
export function filePathFromBranch(branchName: string): string {
  const segments = branchName.slice("content/".length).split("/");
  return `${CONTENT_DOCS_BASE}/${segments.join("/")}.mdx`;
}

/** Full file path for a Topic's MDX file under `apps/fumadocs/content/docs/`. */
export function contentFilePath(coords: ContentCoords): string {
  return coords.track
    ? `${CONTENT_DOCS_BASE}/${coords.roadmap}/${coords.track}/${coords.slug}.mdx`
    : `${CONTENT_DOCS_BASE}/${coords.roadmap}/${coords.slug}.mdx`;
}
