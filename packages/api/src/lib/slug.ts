/**
 * Pure slug ↔ title helpers for Roadmap, Track, and Topic identifiers.
 *
 * Slugs are the canonical filesystem identifier (`apps/fumadocs/content/docs/
 * <roadmap>/<track>/<topic>.mdx`). Titles are the human-readable display
 * form (typically derived from frontmatter, falling back to the slug).
 *
 * Round-trip is intentionally lossy: `slugToTitle(titleToSlug(x))` is not
 * guaranteed to equal `x`. Callers that need exact display strings should
 * pull them from `meta.json` / MDX frontmatter, not from the slug.
 */

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && SLUG_PATTERN.test(slug);
}

export function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
