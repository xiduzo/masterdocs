import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      skillIds: extractSkillIdsFromPage(page.path),
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
 * Returns prev/next topic navigation links across the entire roadmap.
 * Topics are ordered by trackOrder then topicOrder, so navigation flows
 * from the last topic of one track into the first topic of the next.
 */
export function getTopicNavigation(
  roadmapSlug: string,
  _trackSlug: string,
  topicOrder: number,
): {
  prev: { title: string; url: string } | undefined;
  next: { title: string; url: string } | undefined;
} | undefined {
  const structure = getRoadmapStructure(roadmapSlug);
  if (!structure) return undefined;

  // Flatten all topics across all tracks in order
  const allTopics: TopicStructure[] = [];
  for (const track of structure.tracks) {
    for (const topic of track.topics) {
      allTopics.push(topic);
    }
  }

  // Find current topic by matching track and topicOrder
  const track = structure.tracks.find((t) => t.slug === _trackSlug);
  if (!track) return undefined;

  const currentTopic = track.topics.find((t) => t.order === topicOrder);
  if (!currentTopic) return undefined;

  const index = allTopics.findIndex((t) => t.url === currentTopic.url);
  if (index === -1) return undefined;

  return {
    prev:
      index > 0
        ? { title: allTopics[index - 1].title, url: allTopics[index - 1].url }
        : { title: structure.title, url: `/docs/${roadmapSlug}` },
    next:
      index < allTopics.length - 1
        ? { title: allTopics[index + 1].title, url: allTopics[index + 1].url }
        : undefined,
  };
}


/**
 * Extracts skill IDs from a page's raw MDX content by matching
 * `<Skill id="..." />` patterns.
 *
 * @param pagePath - The page's relative path (e.g. "frontend-development/variables-and-data-types.mdx")
 */
export function extractSkillIdsFromPage(pagePath: string): string[] {
  try {
    const fullPath = join(process.cwd(), "content/docs", pagePath);
    const content = readFileSync(fullPath, "utf-8");
    const regex = /<Skill\s[^>]*id=["']([^"']+)["'][^>]*\/?>/g;
    const ids: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      ids.push(match[1]);
    }
    return ids;
  } catch {
    return [];
  }
}
