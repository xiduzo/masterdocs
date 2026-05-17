/**
 * Pure helpers for transforming a `content.list` React Query cache.
 *
 * Optimistic updates live here so each callsite describes *what* changes
 * without re-deriving the nested `groups → files` map every time. Pure
 * functions, fully unit-testable.
 */

import type { RouterOutputs } from "../client";

export type ContentList = RouterOutputs["content"]["list"];
export type ContentGroup = ContentList[number];
export type ContentFile = ContentGroup["files"][number];

export interface ContentFileCoords {
  roadmap: string;
  slug: string;
  track?: string;
}

/**
 * Map over the `files` array within a single Roadmap group, returning a
 * new ContentList. Groups for other Roadmaps are returned by reference.
 */
export function updateRoadmapFiles(
  groups: ContentList | undefined,
  roadmap: string,
  fn: (files: ContentFile[]) => ContentFile[],
): ContentList | undefined {
  if (!groups) return groups;
  return groups.map((g) =>
    g.roadmap === roadmap ? { ...g, files: fn(g.files) } : g,
  );
}

/**
 * Patch a single file (matched by roadmap+slug+track) inside a
 * `content.list` cache. The patch fn receives the matched file only.
 */
export function updateContentFile(
  groups: ContentList | undefined,
  coords: ContentFileCoords,
  patch: (file: ContentFile) => ContentFile,
): ContentList | undefined {
  return updateRoadmapFiles(groups, coords.roadmap, (files) =>
    files.map((f) =>
      f.slug === coords.slug && f.track === coords.track ? patch(f) : f,
    ),
  );
}

