import { stringify, parse } from "yaml";

export interface MdxFrontmatter {
  title: string;
  description?: string;
  roadmap?: string;
  track?: string;
  trackTitle?: string;
  trackOrder?: number;
  topicOrder?: number;
}

/**
 * Parse an MDX string into frontmatter and body.
 * Splits on the first two `---` delimiters, YAML-parses the middle,
 * and strips exactly one leading newline from the body.
 */
export function parseMdx(raw: string): {
  frontmatter: MdxFrontmatter;
  body: string;
} {
  const openIdx = raw.indexOf("---");
  if (openIdx === -1) {
    throw new Error("Missing opening frontmatter delimiter");
  }

  const closeIdx = raw.indexOf("---", openIdx + 3);
  if (closeIdx === -1) {
    throw new Error("Missing closing frontmatter delimiter");
  }

  const yamlStr = raw.slice(openIdx + 3, closeIdx).trim();
  const parsed = parse(yamlStr) as Record<string, unknown>;

  const frontmatter: MdxFrontmatter = {
    title: String(parsed.title ?? ""),
  };

  if (parsed.description !== undefined)
    frontmatter.description = String(parsed.description);
  if (parsed.roadmap !== undefined)
    frontmatter.roadmap = String(parsed.roadmap);
  if (parsed.track !== undefined) frontmatter.track = String(parsed.track);
  if (parsed.trackTitle !== undefined)
    frontmatter.trackTitle = String(parsed.trackTitle);
  if (parsed.trackOrder !== undefined)
    frontmatter.trackOrder = Number(parsed.trackOrder);
  if (parsed.topicOrder !== undefined)
    frontmatter.topicOrder = Number(parsed.topicOrder);

  // Body is everything after the closing `---` delimiter line.
  // Strip exactly one leading newline (the blank line after closing ---).
  let body = raw.slice(closeIdx + 3);
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }

  return { frontmatter, body };
}

/**
 * Serialize frontmatter and body back into an MDX string.
 * YAML-stringifies frontmatter between `---` delimiters,
 * adds one blank line, then the body.
 */
export function serializeMdx(
  frontmatter: MdxFrontmatter,
  body: string,
): string {
  // Build a clean object omitting undefined optional fields
  const obj: Record<string, unknown> = { title: frontmatter.title };
  if (frontmatter.description !== undefined)
    obj.description = frontmatter.description;
  if (frontmatter.roadmap !== undefined) obj.roadmap = frontmatter.roadmap;
  if (frontmatter.track !== undefined) obj.track = frontmatter.track;
  if (frontmatter.trackTitle !== undefined)
    obj.trackTitle = frontmatter.trackTitle;
  if (frontmatter.trackOrder !== undefined)
    obj.trackOrder = frontmatter.trackOrder;
  if (frontmatter.topicOrder !== undefined)
    obj.topicOrder = frontmatter.topicOrder;

  const yamlStr = stringify(obj, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlStr}\n---\n${body}`;
}

/**
 * Validate that a slug contains only lowercase alphanumeric characters and hyphens,
 * and is non-empty.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}
