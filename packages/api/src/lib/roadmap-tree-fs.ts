/**
 * FS-walking adapter for the RoadmapTree builder.
 *
 * Reads MDX files and meta.json directly from disk to construct a Roadmap
 * aggregate. Used by the progress router for skill-id resolution and any
 * other server-side code that needs the structure without going through
 * GitHub.
 *
 * Node-only: imports `node:fs`. Do NOT import this from web/native bundles.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  buildRoadmapTree,
  type Roadmap,
  type RoadmapTopicInput,
} from "./roadmap-tree";

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

/**
 * Parse simple YAML frontmatter from MDX content.
 *
 * Extracts `title` and `description` only — the canonical schema per
 * ADR-0001. A full zod parse via parseMdx is overkill here because we
 * never round-trip these files; we just need the title for display.
 */
function parseFrontmatter(content: string): { title?: string; description?: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;

  const data: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
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

/**
 * Walk the filesystem rooted at content/docs/<roadmapSlug>/ and produce a
 * Roadmap aggregate. Returns undefined if the Roadmap metadata file does
 * not exist.
 */
export function fromFsWalk(roadmapSlug: string): Roadmap | undefined {
  const contentDir = resolveContentDir();
  const roadmapsDir = join(contentDir, "roadmaps");
  const docsDir = join(contentDir, "docs");

  const roadmapFile = join(roadmapsDir, `${roadmapSlug}.mdx`);
  if (!existsSync(roadmapFile)) return undefined;

  const roadmapMeta = parseFrontmatter(readFileSync(roadmapFile, "utf-8"));

  const roadmapDir = join(docsDir, roadmapSlug);
  if (!existsSync(roadmapDir)) return undefined;

  const roadmapMetaJson = readMeta(join(roadmapDir, "meta.json"));
  const trackSlugs = (roadmapMetaJson?.pages ?? []).filter((p) => p !== "index");

  const items: RoadmapTopicInput[] = [];

  for (const trackSlug of trackSlugs) {
    const trackDir = join(roadmapDir, trackSlug);
    if (!existsSync(trackDir) || !statSync(trackDir).isDirectory()) continue;

    const trackMeta = readMeta(join(trackDir, "meta.json"));
    if (!trackMeta) continue;

    const trackTitle = trackMeta.title ?? trackSlug;
    const topicSlugs = trackMeta.pages ?? [];

    for (const topicSlug of topicSlugs) {
      const topicPath = join(trackDir, `${topicSlug}.mdx`);
      if (!existsSync(topicPath)) continue;

      let content: string;
      try {
        content = readFileSync(topicPath, "utf-8");
      } catch {
        continue;
      }

      items.push({
        slug: topicSlug,
        title: parseFrontmatter(content)?.title ?? topicSlug,
        track: trackSlug,
        trackTitle,
        skillIds: extractSkillIds(content),
      });
    }
  }

  return buildRoadmapTree(
    {
      slug: roadmapSlug,
      title: roadmapMeta?.title ?? roadmapSlug,
      description: roadmapMeta?.description ?? "",
    },
    items,
  );
}
