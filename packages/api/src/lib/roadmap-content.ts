/**
 * Lightweight roadmap content resolver for the API package.
 *
 * Reads MDX content files directly from the filesystem to determine
 * roadmap structure and skill IDs. This avoids depending on the Fumadocs
 * content pipeline (which lives in apps/fumadocs).
 *
 * Requirements: 8.1, 8.2, 8.4
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

interface Frontmatter {
  title?: string;
  description?: string;
  roadmap?: string;
  track?: string;
  trackTitle?: string;
  trackOrder?: number;
  topicOrder?: number;
}

// --- Helpers ---

/** Resolve the content directory path relative to the monorepo root. */
function resolveContentDir(): string {
  // Walk up from packages/api (or wherever process.cwd() is) to find the monorepo root
  // by looking for the apps/fumadocs/content directory
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

  // Fallback: assume cwd is monorepo root
  return join(process.cwd(), "apps/fumadocs/content");
}

/** Recursively collect all .mdx files under a directory. */
function collectMdxFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectMdxFiles(full));
    } else if (entry.endsWith(".mdx")) {
      files.push(full);
    }
  }
  return files;
}

/** Parse simple YAML frontmatter from MDX content. */
function parseFrontmatter(content: string): Frontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;

  const yaml = match[1];
  const data: Record<string, string | number> = {};

  for (const line of yaml.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch?.[1] && kvMatch[2]) {
      const key = kvMatch[1];
      let value: string | number = kvMatch[2].trim();
      if (/^\d+$/.test(value)) {
        value = Number.parseInt(value, 10);
      }
      data[key] = value;
    }
  }

  return data as unknown as Frontmatter;
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
 * Build the full content structure for a roadmap, including all tracks,
 * topics, and their skill IDs.
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

  // Collect all docs MDX files and filter by roadmap
  const mdxFiles = collectMdxFiles(docsDir);

  const trackMap = new Map<
    string,
    {
      slug: string;
      title: string;
      order: number;
      topics: TopicContent[];
      skillIds: string[];
    }
  >();

  for (const filePath of mdxFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm || fm.roadmap !== roadmapSlug) continue;

    // Skip pages with incomplete roadmap frontmatter
    if (!fm.track || !fm.trackTitle || fm.trackOrder == null || fm.topicOrder == null) {
      continue;
    }

    const skillIds = extractSkillIds(content);

    if (!trackMap.has(fm.track)) {
      trackMap.set(fm.track, {
        slug: fm.track,
        title: fm.trackTitle,
        order: fm.trackOrder,
        topics: [],
        skillIds: [],
      });
    }

    const track = trackMap.get(fm.track)!;

    // Derive topic slug from filename
    const fileName = filePath.split("/").pop() ?? "";
    const topicSlug = fileName.replace(/\.mdx?$/, "");

    track.topics.push({
      slug: topicSlug,
      title: fm.title ?? topicSlug,
      order: fm.topicOrder,
      skillIds,
    });

    track.skillIds.push(...skillIds);
  }

  // Sort tracks by order, topics within each track by order
  const tracks = Array.from(trackMap.values())
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      ...track,
      topics: track.topics.sort((a, b) => a.order - b.order),
    }));

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
