import { describe, expect, test } from "bun:test";

import {
  updateContentFile,
  updateRoadmapFiles,
  type ContentFile,
  type ContentList,
} from "../content-list-cache";

const baseFile = (over: Partial<ContentFile>): ContentFile =>
  ({
    slug: over.slug ?? "x",
    title: over.title ?? "X",
    state: over.state ?? ("published" as const),
    path: over.path ?? `apps/fumadocs/content/docs/r/${over.slug ?? "x"}.mdx`,
    ...over,
  }) as ContentFile;

const fixture = (): ContentList => [
  {
    roadmap: "arduino",
    files: [
      baseFile({ slug: "index" }),
      baseFile({ slug: "a", track: "sensors" }),
      baseFile({ slug: "b", track: "sensors" }),
    ],
  },
  { roadmap: "figma", files: [] },
];

describe("updateRoadmapFiles", () => {
  test("transforms files only for the matching roadmap", () => {
    const result = updateRoadmapFiles(fixture(), "arduino", (files) =>
      files.slice(0, 1),
    );
    expect(result?.[0]!.files).toHaveLength(1);
    expect(result?.[1]!.files).toEqual([]);
  });

  test("undefined input returned unchanged", () => {
    expect(updateRoadmapFiles(undefined, "arduino", (f) => f)).toBeUndefined();
  });

  test("non-matching groups returned by reference", () => {
    const input = fixture();
    const result = updateRoadmapFiles(input, "arduino", (f) => [...f]);
    expect(result?.[1]).toBe(input[1]!);
  });
});

describe("updateContentFile", () => {
  test("patches the single file matching coords", () => {
    const result = updateContentFile(
      fixture(),
      { roadmap: "arduino", slug: "a", track: "sensors" },
      (f) => ({ ...f, state: "pending_review" as const }),
    );
    expect(result?.[0]!.files[1]!.state).toBe("pending_review");
    expect(result?.[0]!.files[2]!.state).toBe("published");
  });

  test("track must match — root file is not patched when coords have a track", () => {
    const result = updateContentFile(
      fixture(),
      { roadmap: "arduino", slug: "index", track: "sensors" },
      (f) => ({ ...f, title: "PATCHED" }),
    );
    expect(result?.[0]!.files[0]!.title).toBe("X");
  });

  test("returns input unchanged when roadmap is absent", () => {
    const input = fixture();
    const result = updateContentFile(
      input,
      { roadmap: "missing", slug: "a" },
      (f) => f,
    );
    expect(result).toEqual(input);
  });
});

