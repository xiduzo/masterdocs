import { existsSync, readFileSync } from "node:fs";
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
  return entry.info.path.replace(/\.mdx?$/, "").replace(/^\//, "");
}

/** Read and parse a meta.json file, returning null if it doesn't exist. */
function readMeta(metaPath: string): { title?: string; pages?: string[] } | null {
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
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

/** Set of known roadmap slugs for quick lookup. */
const roadmapSlugs = new Set(roadmapEntries.map(getRoadmapSlug));

/**
 * Check if a slug corresponds to a known roadmap.
 */
export function isRoadmap(slug: string): boolean {
  return roadmapSlugs.has(slug);
}

/**
 * Builds the full structure for a given roadmap by reading the folder
 * structure and meta.json files for ordering.
 *
 * Returns `undefined` if the roadmap slug doesn't match any known roadmap.
 */
export function getRoadmapStructure(
  roadmapSlug: string,
): RoadmapStructure | undefined {
  const roadmapMeta = roadmapEntries.find(
    (entry) => getRoadmapSlug(entry) === roadmapSlug,
  );
  if (!roadmapMeta) return undefined;

  const contentDir = join(process.cwd(), "content/docs");

  // Read roadmap meta.json for track ordering
  const roadmapMetaJson = readMeta(join(contentDir, roadmapSlug, "meta.json"));
  const trackSlugs = (roadmapMetaJson?.pages ?? []).filter((p: string) => p !== "index");

  const allPages = source.getPages();
  const tracks: TrackStructure[] = [];

  for (let trackIdx = 0; trackIdx < trackSlugs.length; trackIdx++) {
    const trackSlug = trackSlugs[trackIdx];
    const trackMetaPath = join(contentDir, roadmapSlug, trackSlug, "meta.json");
    const trackMeta = readMeta(trackMetaPath);
    if (!trackMeta) continue;

    const topicSlugs = (trackMeta.pages ?? []).filter((p: string) => p !== "index");
    const topics: TopicStructure[] = [];

    for (let topicIdx = 0; topicIdx < topicSlugs.length; topicIdx++) {
      const topicSlug = topicSlugs[topicIdx];
      const page = allPages.find(
        (p) => p.slugs[0] === roadmapSlug && p.slugs[1] === trackSlug && p.slugs[2] === topicSlug,
      );
      if (!page) continue;

      topics.push({
        slug: topicSlug,
        title: page.data.title,
        order: topicIdx,
        skillIds: extractSkillIdsFromPage(page.path),
        url: page.url,
      });
    }

    tracks.push({
      slug: trackSlug,
      title: trackMeta.title ?? trackSlug,
      order: trackIdx,
      topics,
    });
  }

  return {
    slug: roadmapSlug,
    title: roadmapMeta.title,
    description: roadmapMeta.description ?? "",
    tracks,
  };
}

/**
 * Returns prev/next topic navigation links across the entire roadmap.
 * Topics are ordered by track order then topic order within each track.
 */
export function getTopicNavigation(
  roadmapSlug: string,
  topicUrl: string,
): {
  prev: { title: string; url: string } | undefined;
  next: { title: string; url: string } | undefined;
} | undefined {
  const structure = getRoadmapStructure(roadmapSlug);
  if (!structure) return undefined;

  // Flatten all topics across all tracks in order
  const allTopics: TopicStructure[] = structure.tracks.flatMap((t) => t.topics);

  const index = allTopics.findIndex((t) => t.url === topicUrl);
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
