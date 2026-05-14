/**
 * Build-time validation for roadmap MDX content.
 *
 * Validates:
 * - All <Skill> components have `id` and `label` props (blocks build on missing)
 * - Skill ID uniqueness within each roadmap (blocks build on duplicates)
 *
 * Per ADR-0001 (docs/adr/0001-content-structure-source.md), Roadmap/Track
 * membership is derived from the file's FS path, not from frontmatter.
 *
 * Requirements: 2.4, 2.5
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// --- Types ---

interface SkillMatch {
  file: string;
  raw: string;
  id: string | undefined;
  label: string | undefined;
  line: number;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

// --- Helpers ---

/** Recursively collect all .mdx files under a directory. */
function collectMdxFiles(dir: string): string[] {
  const files: string[] = [];
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

/**
 * Find all <Skill ...> components in MDX content, extracting id and label props.
 * Returns matches with line numbers for error reporting.
 */
function findSkillComponents(content: string, filePath: string): SkillMatch[] {
  const matches: SkillMatch[] = [];
  const lines = content.split("\n");

  // Match <Skill ... /> or <Skill ...> patterns
  const regex = /<Skill\s([^>]*?)\/?>/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      const attrs = match[1];

      // Extract id prop
      const idMatch = attrs.match(/id=["']([^"']*)["']/);
      // Extract label prop
      const labelMatch = attrs.match(/label=["']([^"']*)["']/);

      matches.push({
        file: filePath,
        raw: match[0],
        id: idMatch?.[1],
        label: labelMatch?.[1],
        line: i + 1,
      });
    }
  }

  return matches;
}

/** First segment of the file's path under content/docs is its roadmap slug. */
function roadmapFromPath(relPath: string): string | undefined {
  const segments = relPath.split("/");
  return segments.length > 1 ? segments[0] : undefined;
}

// --- Main validation ---

/**
 * Validate all MDX content files in the docs directory.
 * Returns errors (which should block the build) and warnings.
 */
export function validateRoadmapContent(contentDocsDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let mdxFiles: string[];
  try {
    mdxFiles = collectMdxFiles(contentDocsDir);
  } catch {
    warnings.push(`Could not read content directory: ${contentDocsDir}`);
    return { errors, warnings };
  }

  // Collect all skills grouped by roadmap for uniqueness checking
  const skillsByRoadmap = new Map<string, { id: string; file: string; line: number }[]>();

  for (const filePath of mdxFiles) {
    const relPath = relative(contentDocsDir, filePath);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      warnings.push(`Could not read file: ${relPath}`);
      continue;
    }

    // --- Skill component validation ---
    const skills = findSkillComponents(content, relPath);
    const roadmapSlug = roadmapFromPath(relPath);

    for (const skill of skills) {
      // Validate required props (Requirement 2.4)
      if (!skill.id || skill.id.trim() === "") {
        errors.push(
          `[${relPath}:${skill.line}] <Skill> component is missing required "id" prop: ${skill.raw}`,
        );
      }
      if (!skill.label || skill.label.trim() === "") {
        errors.push(
          `[${relPath}:${skill.line}] <Skill> component is missing required "label" prop: ${skill.raw}`,
        );
      }

      // Collect for uniqueness check if we have a valid id and the file belongs to a roadmap
      if (skill.id && roadmapSlug) {
        if (!skillsByRoadmap.has(roadmapSlug)) {
          skillsByRoadmap.set(roadmapSlug, []);
        }
        skillsByRoadmap.get(roadmapSlug)!.push({
          id: skill.id,
          file: relPath,
          line: skill.line,
        });
      }
    }
  }

  // --- Skill ID uniqueness validation per roadmap (Requirement 2.5) ---
  for (const [roadmapSlug, skills] of skillsByRoadmap) {
    const seen = new Map<string, { file: string; line: number }>();

    for (const skill of skills) {
      const existing = seen.get(skill.id);
      if (existing) {
        errors.push(
          `[roadmap: ${roadmapSlug}] Duplicate skill ID "${skill.id}" found in ` +
            `${skill.file}:${skill.line} and ${existing.file}:${existing.line}`,
        );
      } else {
        seen.set(skill.id, { file: skill.file, line: skill.line });
      }
    }
  }

  return { errors, warnings };
}

/**
 * Run validation and exit with error code if there are blocking errors.
 * Intended to be called during the build process.
 */
export function runBuildValidation(contentDocsDir: string): void {
  const { errors, warnings } = validateRoadmapContent(contentDocsDir);

  // Log warnings
  for (const warning of warnings) {
    console.warn(`\x1b[33m⚠ ROADMAP WARNING:\x1b[0m ${warning}`);
  }

  // Log and throw on errors
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`\x1b[31m✖ ROADMAP ERROR:\x1b[0m ${error}`);
    }
    throw new Error(
      `Roadmap content validation failed with ${errors.length} error(s). Fix the issues above to continue.`,
    );
  }

  if (warnings.length > 0) {
    console.log(
      `\x1b[33mRoadmap validation completed with ${warnings.length} warning(s).\x1b[0m`,
    );
  } else {
    console.log("\x1b[32m✓ Roadmap content validation passed.\x1b[0m");
  }
}
