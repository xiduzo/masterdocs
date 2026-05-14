import { stringify, parse } from "yaml";
import { z } from "zod";

/**
 * Canonical schema for Topic MDX frontmatter.
 *
 * Roadmap/Track/Topic hierarchy is sourced from FS path + meta.json
 * (see docs/adr/0001-content-structure-source.md). Frontmatter carries
 * only display metadata.
 *
 * Default `.strip()` behaviour is intentional: legacy MDX files that
 * still carry roadmap/track/trackOrder/topicOrder fields will have
 * those fields silently dropped on parse and on the next save.
 */
export const mdxFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

export type MdxFrontmatter = z.infer<typeof mdxFrontmatterSchema>;

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
  const parsed = parse(yamlStr) ?? {};
  const frontmatter = mdxFrontmatterSchema.parse(parsed);

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
  const obj = mdxFrontmatterSchema.parse(frontmatter);
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
