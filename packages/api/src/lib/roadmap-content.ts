/**
 * Lightweight roadmap content resolver for the API package.
 *
 * Reads MDX content files and meta.json files directly from the filesystem
 * to determine roadmap structure and skill IDs. Uses folder structure and
 * meta.json for ordering (convention over configuration).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- Interfaces ---

export interface RoadmapContentStructure {
  slug: string;
  title: string;
  description: string;
  tracks: TrackContent[];
}

export interface TrackContent {
  slug: string;
  title: string;
  order: number;
  topics: TopicContent[];
  skillIds: string[];
}

export interface TopicContent {
  slug: string;
  title: string;
  order: number;
  skillIds: string[];
}

// --- Helpers ---

/** Resolve the content directory path relative to the monorepo root. */
function resolveContentDir(): string {
  const candidates = [
    join(process.cwd(), "apps/fumadocs/content"),
    join(process.cwd(), "../../apps/fumadocs/content"),
    join(process.cwd(), "../apps/fumadocs/content"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return join(process.cwd(), "apps/fumadocs/content");
}

/** Parse simple YAML frontmatter from MDX content — extracts title and description only. */
function parseFrontmatter(content: string): { title?: string; description?: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;

  const yaml = match[1];
  const data: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch?.[1] && kvMatch[2]) {
      data[kvMatch[1]] = kvMatch[2].trim();
    }
  }

  return data as { title?: string; description?: string };
}

/** Read and parse a meta.json file, returning null on failure. */
function readMeta(metaPath: string): { title?: string; pages?: string[] } | null {
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

/** Extract skill IDs from MDX content by matching <Skill id="..." /> patterns. */
function extractSkillIds(content: string): string[] {
  const regex = /<Skill\s[^>]*id=["']([^"']+)["'][^>]*\/?>/g;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
}

// --- Public API ---

/**
 * Check if a roadmap slug corresponds to an existing roadmap.
 */
export function roadmapExists(roadmapSlug: string): boolean {
  const contentDir = resolveContentDir();
  const roadmapsDir = join(contentDir, "roadmaps");

  if (!existsSync(roadmapsDir)) return false;

  const files = readdirSync(roadmapsDir);
  return files.some(
    (f) => f === `${roadmapSlug}.mdx` || f === `${roadmapSlug}.md`,
  );
}

/**
 * Build the full content structure for a roadmap using folder structure
 * and meta.json files for ordering.
 *
 * Returns undefined if the roadmap doesn't exist.
 */
export function getRoadmapContent(
  roadmapSlug: string,
): RoadmapContentStructure | undefined {
  const contentDir = resolveContentDir();
  const roadmapsDir = join(contentDir, "roadmaps");
  const docsDir = join(contentDir, "docs");

  // Check roadmap metadata exists
  const roadmapFile = join(roadmapsDir, `${roadmapSlug}.mdx`);
  if (!existsSync(roadmapFile)) return undefined;

  const roadmapContent = readFileSync(roadmapFile, "utf-8");
  const roadmapMeta = parseFrontmatter(roadmapContent);

  const roadmapDir = join(docsDir, roadmapSlug);
  if (!existsSync(roadmapDir)) return undefined;

  // Read roadmap meta.json for track ordering
  const roadmapMetaJson = readMeta(join(roadmapDir, "meta.json"));
  const trackSlugs = (roadmapMetaJson?.pages ?? []).filter((p: string) => p !== "index");

  const tracks: TrackContent[] = [];

  for (let trackIdx = 0; trackIdx < trackSlugs.length; trackIdx++) {
    const trackSlug = trackSlugs[trackIdx];
    const trackDir = join(roadmapDir, trackSlug);
    if (!existsSync(trackDir) || !statSync(trackDir).isDirectory()) continue;

    // Read track meta.json for title and topic ordering
    const trackMeta = readMeta(join(trackDir, "meta.json"));
    if (!trackMeta) continue;

    const topicSlugs = (trackMeta.pages ?? []).filter((p: string) => p !== "index");
    const topics: TopicContent[] = [];
    const allSkillIds: string[] = [];

    for (let topicIdx = 0; topicIdx < topicSlugs.length; topicIdx++) {
      const topicSlug = topicSlugs[topicIdx];
      const topicPath = join(trackDir, `${topicSlug}.mdx`);
      if (!existsSync(topicPath)) continue;

      let content: string;
      try {
        content = readFileSync(topicPath, "utf-8");
      } catch {
        continue;
      }

      const fm = parseFrontmatter(content);
      const skillIds = extractSkillIds(content);
      allSkillIds.push(...skillIds);

      topics.push({
        slug: topicSlug,
        title: fm?.title ?? topicSlug,
        order: topicIdx,
        skillIds,
      });
    }

    tracks.push({
      slug: trackSlug,
      title: trackMeta.title ?? trackSlug,
      order: trackIdx,
      topics,
      skillIds: allSkillIds,
    });
  }

  return {
    slug: roadmapSlug,
    title: roadmapMeta?.title ?? roadmapSlug,
    description: roadmapMeta?.description ?? "",
    tracks,
  };
}

/**
 * Get all skill IDs that belong to a specific roadmap.
 * Returns undefined if the roadmap doesn't exist.
 */
export function getRoadmapSkillIds(
  roadmapSlug: string,
): string[] | undefined {
  const structure = getRoadmapContent(roadmapSlug);
  if (!structure) return undefined;

  return structure.tracks.flatMap((track) => track.skillIds);
}
