/**
 * Pure RoadmapTree builder and the `fromContentList` adapter.
 *
 * Roadmap/Track/Topic hierarchy is sourced from FS path + meta.json
 * (see docs/adr/0001-content-structure-source.md). This module groups
 * a flat list of Topic inputs — already ordered by the caller — into
 * a canonical Roadmap aggregate consumed by both server-side code
 * (skill-id resolution in the progress router) and client-side code
 * (admin tree rendering).
 *
 * No runtime dependencies. Safe to bundle into web/native clients.
 */

export interface RoadmapMetadata {
  slug: string;
  title: string;
  description?: string;
}

export interface RoadmapTopicInput {
  /** Topic slug (filename without extension). */
  slug: string;
  /** Display title from MDX frontmatter. */
  title: string;
  /** Track slug. Undefined = a roadmap-level file (e.g. index page). */
  track?: string;
  /** Track display title — consulted only on the first occurrence of a track slug. */
  trackTitle?: string;
  /** Adapter-specific pass-through. */
  state?: "published" | "pending_review";
  /** Adapter-specific pass-through. Aggregated into Track.skillIds. */
  skillIds?: string[];
}

export interface Roadmap {
  slug: string;
  title: string;
  description?: string;
  /** Topics at the roadmap level (e.g. content/docs/<roadmap>/index.mdx). */
  rootTopics: Topic[];
  /** Tracks in the order their first Topic appeared in input. */
  tracks: Track[];
}

export interface Track {
  slug: string;
  title: string;
  /** Zero-based position among tracks of this Roadmap. */
  order: number;
  topics: Topic[];
  /** Aggregated skill IDs from every Topic in this Track (in order). */
  skillIds: string[];
}

export interface Topic {
  slug: string;
  title: string;
  /** Zero-based position among siblings (rootTopics or Track.topics). */
  order: number;
  /** Same as the parent Track's slug; undefined for rootTopics. */
  track?: string;
  state?: "published" | "pending_review";
  skillIds: string[];
}

/**
 * Build a Roadmap aggregate from a flat list of Topic inputs already in display order.
 *
 * Items with `track === undefined` become rootTopics. Items with `slug === "index"`
 * under a track create the Track entry but are not themselves added to its topics
 * list — they are the track's landing page, not its content.
 */
export function buildRoadmapTree(
  meta: RoadmapMetadata,
  items: readonly RoadmapTopicInput[],
): Roadmap {
  const rootTopics: Topic[] = [];
  const trackMap = new Map<string, Track>();
  let nextTrackOrder = 0;

  for (const item of items) {
    if (!item.track) {
      rootTopics.push({
        slug: item.slug,
        title: item.title,
        order: rootTopics.length,
        track: undefined,
        state: item.state,
        skillIds: item.skillIds ?? [],
      });
      continue;
    }

    let track = trackMap.get(item.track);
    if (!track) {
      track = {
        slug: item.track,
        title: item.trackTitle ?? slugToTitle(item.track),
        order: nextTrackOrder++,
        topics: [],
        skillIds: [],
      };
      trackMap.set(item.track, track);
    }

    // Track-level index files participate only in creating the Track entry.
    if (item.slug === "index") continue;

    const skillIds = item.skillIds ?? [];
    track.topics.push({
      slug: item.slug,
      title: item.title,
      order: track.topics.length,
      track: item.track,
      state: item.state,
      skillIds,
    });
    track.skillIds.push(...skillIds);
  }

  return {
    slug: meta.slug,
    title: meta.title,
    description: meta.description,
    rootTopics,
    tracks: [...trackMap.values()],
  };
}

/**
 * Convenience: every skill ID across every Track in a Roadmap (rootTopics are
 * not currently expected to carry skills, but they are included for safety).
 */
export function allSkillIds(roadmap: Roadmap): string[] {
  return [
    ...roadmap.rootTopics.flatMap((t) => t.skillIds),
    ...roadmap.tracks.flatMap((t) => t.skillIds),
  ];
}

// ---------------------------------------------------------------------------
// Adapter: tRPC content.list output
// ---------------------------------------------------------------------------

/** Subset of a `content.list` file row the adapter needs. */
export interface ContentListFile {
  slug: string;
  title: string;
  state: "published" | "pending_review";
  track?: string;
  /** Optional convenience field set by the list procedure for the first file in a track. */
  trackTitle?: string;
}

export interface ContentListGroup {
  roadmap: string;
  files: readonly ContentListFile[];
}

/**
 * Build a Roadmap from a `content.list` group. The list procedure already
 * sorts files by meta.json `pages` arrays, so input order is taken as truth.
 *
 * If neither `meta.title` nor an index file with a title is found, the
 * Roadmap slug is humanized for display.
 */
export function fromContentList(
  group: ContentListGroup,
  meta?: { title?: string; description?: string },
): Roadmap {
  const indexFile = group.files.find((f) => f.slug === "index" && !f.track);
  return buildRoadmapTree(
    {
      slug: group.roadmap,
      title: meta?.title ?? indexFile?.title ?? slugToTitle(group.roadmap),
      description: meta?.description,
    },
    group.files.map((f) => ({
      slug: f.slug,
      title: f.title,
      track: f.track,
      trackTitle: f.trackTitle,
      state: f.state,
    })),
  );
}

// ---------------------------------------------------------------------------
// Local helper (intentionally not exported — same shape exists in -breadcrumbs
// on web; consolidation into @masterdocs/ui or similar is out of scope here).
// ---------------------------------------------------------------------------

function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
