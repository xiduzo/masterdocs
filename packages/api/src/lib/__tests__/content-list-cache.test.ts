import { describe, expect, test } from "bun:test";

import {
  reorderTrackFiles,
  reorderTracks,
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

describe("reorderTracks", () => {
  test("assigns trackOrder by orderedTracks index", () => {
    const files = fixture()[0]!.files;
    const reordered = reorderTracks(files, ["sensors"]);
    const sensorsFile = reordered.find((f) => f.slug === "a");
    // trackOrder is a synthetic field; cast to access.
    expect((sensorsFile as { trackOrder?: number }).trackOrder).toBe(1);
  });

  test("files without a track are returned unchanged (no trackOrder added)", () => {
    const files = fixture()[0]!.files;
    const reordered = reorderTracks(files, ["sensors"]);
    expect(reordered[0]).toEqual(files[0]!);
  });

  test("unknown track yields trackOrder 0 (index -1 + 1)", () => {
    const files = fixture()[0]!.files;
    const reordered = reorderTracks(files, ["other"]);
    const sensorsFile = reordered.find((f) => f.slug === "a");
    expect((sensorsFile as { trackOrder?: number }).trackOrder).toBe(0);
  });
});

describe("reorderTrackFiles", () => {
  test("assigns topicOrder for matching track files", () => {
    const files = fixture()[0]!.files;
    const reordered = reorderTrackFiles(files, "sensors", ["b", "a"]);
    expect((reordered.find((f) => f.slug === "a") as { topicOrder?: number }).topicOrder).toBe(2);
    expect((reordered.find((f) => f.slug === "b") as { topicOrder?: number }).topicOrder).toBe(1);
  });

  test("files outside the track are returned unchanged", () => {
    const files = fixture()[0]!.files;
    const reordered = reorderTrackFiles(files, "other", ["a"]);
    expect(reordered).toEqual(files);
  });

  test("a track's own index file is skipped", () => {
    const files: ContentList[number]["files"] = [
      baseFile({ slug: "index", track: "sensors" }),
      baseFile({ slug: "a", track: "sensors" }),
    ];
    const reordered = reorderTrackFiles(files, "sensors", ["a"]);
    expect((reordered[0] as { topicOrder?: number }).topicOrder).toBeUndefined();
    expect((reordered[1] as { topicOrder?: number }).topicOrder).toBe(1);
  });
});
