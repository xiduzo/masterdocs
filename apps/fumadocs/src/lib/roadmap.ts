import { source, roadmapEntries } from "./source";

// --- Interfaces ---

export interface RoadmapStructure {
  slug: string;
  title: string;
  description: string;
  tracks: TrackStructure[];
}

export interface TrackStructure {
  slug: string;
  title: string;
  order: number;
  topics: TopicStructure[];
}

export interface TopicStructure {
  slug: string;
  title: string;
  order: number;
  // TODO: Skill IDs are embedded in MDX content as <Skill id="..." /> components.
  // Extracting them at build/request time requires parsing MDX content, which isn't
  // straightforward here. For now this is an empty array. A future approach could
  // extract skill IDs via frontmatter metadata or a build-time plugin.
  skillIds: string[];
  url: string;
}

// --- Helpers ---

/** Extract the slug from a roadmap collection entry's file path. */
function getRoadmapSlug(
  entry: (typeof roadmapEntries)[number],
): string {
  // info.path is the virtualized path, e.g. "frontend-development"
  return entry.info.path.replace(/\.mdx?$/, "").replace(/^\//, "");
}

// --- Utility Functions ---

/**
 * Returns metadata for all available roadmaps.
 */
export function getAllRoadmaps(): Array<{
  slug: string;
  title: string;
  description: string;
}> {
  return roadmapEntries.map((entry) => ({
    slug: getRoadmapSlug(entry),
    title: entry.title,
    description: entry.description ?? "",
  }));
}

/**
 * Builds the full structure for a given roadmap by filtering source pages
 * that have matching `roadmap` frontmatter, grouping them by track, and
 * sorting by trackOrder / topicOrder.
 *
 * Returns `undefined` if the roadmap slug doesn't match any known roadmap.
 */
export function getRoadmapStructure(
  roadmapSlug: string,
): RoadmapStructure | undefined {
  // Verify the roadmap exists in the metadata collection
  const roadmapMeta = roadmapEntries.find(
    (entry) => getRoadmapSlug(entry) === roadmapSlug,
  );
  if (!roadmapMeta) return undefined;

  // Filter pages that belong to this roadmap
  const pages = source.getPages().filter((page) => {
    return page.data.roadmap === roadmapSlug;
  });

  // Group pages by track
  const trackMap = new Map<
    string,
    {
      slug: string;
      title: string;
      order: number;
      topics: TopicStructure[];
    }
  >();

  for (const page of pages) {
    const { track: trackSlug, trackTitle, trackOrder, topicOrder } = page.data;

    // Skip pages with incomplete roadmap frontmatter
    if (!trackSlug || !trackTitle || trackOrder == null || topicOrder == null) {
      continue;
    }

    if (!trackMap.has(trackSlug)) {
      trackMap.set(trackSlug, {
        slug: trackSlug,
        title: trackTitle,
        order: trackOrder,
        topics: [],
      });
    }

    const track = trackMap.get(trackSlug)!;
    track.topics.push({
      slug: page.slugs[page.slugs.length - 1],
      title: page.data.title,
      order: topicOrder,
      skillIds: [], // TODO: extract from MDX content (see note on TopicStructure)
      url: page.url,
    });
  }

  // Sort tracks by order, then topics within each track by order
  const tracks = Array.from(trackMap.values())
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      ...track,
      topics: track.topics.sort((a, b) => a.order - b.order),
    }));

  return {
    slug: roadmapSlug,
    title: roadmapMeta.title,
    description: roadmapMeta.description ?? "",
    tracks,
  };
}

/**
 * Returns prev/next topic navigation links within a track.
 * Returns `undefined` for prev when at the first topic, and `undefined`
 * for next when at the last topic.
 */
export function getTopicNavigation(
  roadmapSlug: string,
  trackSlug: string,
  topicOrder: number,
): {
  prev: { title: string; url: string } | undefined;
  next: { title: string; url: string } | undefined;
} | undefined {
  const structure = getRoadmapStructure(roadmapSlug);
  if (!structure) return undefined;

  const track = structure.tracks.find((t) => t.slug === trackSlug);
  if (!track) return undefined;

  // Topics are already sorted by order from getRoadmapStructure
  const index = track.topics.findIndex((t) => t.order === topicOrder);
  if (index === -1) return undefined;

  return {
    prev:
      index > 0
        ? { title: track.topics[index - 1].title, url: track.topics[index - 1].url }
        : undefined,
    next:
      index < track.topics.length - 1
        ? { title: track.topics[index + 1].title, url: track.topics[index + 1].url }
        : undefined,
  };
}
