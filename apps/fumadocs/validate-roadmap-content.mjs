/**
 * Build-time validation for roadmap MDX content.
 * Plain JS module importable from next.config.mjs.
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

/** Recursively collect all .mdx files under a directory. */
function collectMdxFiles(dir) {
  const files = [];
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
 * Find all <Skill ...> components in MDX content.
 */
function findSkillComponents(content, filePath) {
  const matches = [];
  const lines = content.split("\n");
  const regex = /<Skill\s([^>]*?)\/?>/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    regex.lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      const attrs = match[1];
      const idMatch = attrs.match(/id=["']([^"']*)["']/);
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
function roadmapFromPath(relPath) {
  const segments = relPath.split("/");
  return segments.length > 1 ? segments[0] : undefined;
}

/**
 * Validate all MDX content files in the docs directory.
 */
export function validateRoadmapContent(contentDocsDir) {
  const errors = [];
  const warnings = [];

  let mdxFiles;
  try {
    mdxFiles = collectMdxFiles(contentDocsDir);
  } catch {
    warnings.push(`Could not read content directory: ${contentDocsDir}`);
    return { errors, warnings };
  }

  const skillsByRoadmap = new Map();

  for (const filePath of mdxFiles) {
    const relPath = relative(contentDocsDir, filePath);
    let content;
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

      if (skill.id && roadmapSlug) {
        if (!skillsByRoadmap.has(roadmapSlug)) {
          skillsByRoadmap.set(roadmapSlug, []);
        }
        skillsByRoadmap.get(roadmapSlug).push({
          id: skill.id,
          file: relPath,
          line: skill.line,
        });
      }
    }
  }

  // --- Skill ID uniqueness per roadmap ---
  for (const [roadmapSlug, skills] of skillsByRoadmap) {
    const seen = new Map();

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
 * Run validation and throw on errors. Called during build.
 */
export function runBuildValidation(contentDocsDir) {
  const { errors, warnings } = validateRoadmapContent(contentDocsDir);

  for (const warning of warnings) {
    console.warn(`\x1b[33m⚠ ROADMAP WARNING:\x1b[0m ${warning}`);
  }

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
