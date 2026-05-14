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

/**
 * Assign the synthetic `trackOrder` field to each file according to its
 * Track's position in `orderedTracks`. Files without a Track are returned
 * unchanged.
 *
 * `trackOrder` is the input shape expected by the `content.reorder`
 * mutation, not part of the canonical RouterOutputs shape — it is written
 * onto cache files for optimistic-update bookkeeping only.
 */
export function reorderTracks(
  files: ContentFile[],
  orderedTracks: string[],
): ContentFile[] {
  return files.map((f) =>
    f.track ? { ...f, trackOrder: orderedTracks.indexOf(f.track) + 1 } : f,
  );
}

/**
 * Assign the synthetic `topicOrder` field to each Topic in a specific
 * Track. Files outside the Track and the Track's own `index` file are
 * returned unchanged.
 */
export function reorderTrackFiles(
  files: ContentFile[],
  trackSlug: string,
  orderedSlugs: string[],
): ContentFile[] {
  return files.map((f) => {
    if (f.track !== trackSlug || f.slug === "index") return f;
    const idx = orderedSlugs.indexOf(f.slug);
    return idx !== -1 ? { ...f, topicOrder: idx + 1 } : f;
  });
}
