import { beforeEach, describe, expect, test } from "bun:test";

import {
  ContentAlreadyExistsError,
  ContentMergeConflictError,
  ContentNotFoundError,
} from "../content-repository";
import { FakeContentRepository } from "../fake-content-repository";
import { serializeMdx as serializeMdxForTests } from "../mdx";

let repo: FakeContentRepository;

beforeEach(() => {
  repo = new FakeContentRepository();
});

const ARDUINO_TEMP = {
  coords: { roadmap: "arduino", slug: "temperature", track: "sensors" },
  frontmatter: { title: "Temperature" },
  body: "Body content.",
};

describe("submitTopicEdit", () => {
  test("creates a new Submission on first call", async () => {
    const result = await repo.submitTopicEdit(ARDUINO_TEMP);
    expect(result.isNew).toBe(true);
    expect(result.prNumber).toBe(1);
    expect(result.branchName).toBe("content/arduino/sensors/temperature");
    expect(repo.pendingPRs()).toHaveLength(1);
  });

  test("second call with the same coords updates the existing Submission", async () => {
    const first = await repo.submitTopicEdit(ARDUINO_TEMP);
    const second = await repo.submitTopicEdit({
      ...ARDUINO_TEMP,
      frontmatter: { title: "Temperature (v2)" },
    });
    expect(second.isNew).toBe(false);
    expect(second.prNumber).toBe(first.prNumber);
    expect(repo.pendingPRs()).toHaveLength(1);
  });

  test("different coords create distinct Submissions", async () => {
    const a = await repo.submitTopicEdit(ARDUINO_TEMP);
    const b = await repo.submitTopicEdit({
      coords: { roadmap: "arduino", slug: "humidity", track: "sensors" },
      frontmatter: { title: "Humidity" },
      body: "Body content.",
    });
    expect(a.prNumber).not.toBe(b.prNumber);
    expect(repo.pendingPRs()).toHaveLength(2);
  });

  test("track-less Topic uses the roadmap-level branch path", async () => {
    const r = await repo.submitTopicEdit({
      coords: { roadmap: "arduino", slug: "index" },
      frontmatter: { title: "Arduino" },
      body: "",
    });
    expect(r.branchName).toBe("content/arduino/index");
  });
});

describe("publishTopic", () => {
  test("merges the Submission's file onto main and closes it", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    await repo.publishTopic(prNumber);
    expect(repo.pendingPRs()).toHaveLength(0);
    expect(repo.mainFiles()).toHaveLength(1);
    expect(repo.mainFiles()[0]!.path).toBe(
      "apps/fumadocs/content/docs/arduino/sensors/temperature.mdx",
    );
    expect(repo.mainFiles()[0]!.content).toContain("Temperature");
  });

  test("raises ContentMergeConflictError when configured", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    repo.simulateMergeConflict = true;
    await expect(repo.publishTopic(prNumber)).rejects.toBeInstanceOf(
      ContentMergeConflictError,
    );
    // Submission remains open after a merge conflict.
    expect(repo.pendingPRs()).toHaveLength(1);
  });

  test("unknown PR number raises", async () => {
    await expect(repo.publishTopic(999)).rejects.toThrow("No such PR: 999");
  });
});

describe("discardTopic", () => {
  test("removes the Submission without touching main", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    await repo.discardTopic(prNumber);
    expect(repo.pendingPRs()).toHaveLength(0);
    expect(repo.mainFiles()).toHaveLength(0);
  });

  test("after discard, a fresh submit gets a new PR number", async () => {
    const first = await repo.submitTopicEdit(ARDUINO_TEMP);
    await repo.discardTopic(first.prNumber);
    const second = await repo.submitTopicEdit(ARDUINO_TEMP);
    expect(second.isNew).toBe(true);
    expect(second.prNumber).not.toBe(first.prNumber);
  });
});

describe("checkConflict", () => {
  test("reports no conflict when main has not advanced", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    const status = await repo.checkConflict(prNumber);
    expect(status.hasConflict).toBe(false);
    expect(status.mainAdvanced).toBe(false);
  });

  test("reports mainAdvanced but no conflict when main moved without touching the file", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    repo.advanceMainUnrelated();
    const status = await repo.checkConflict(prNumber);
    expect(status.mainAdvanced).toBe(true);
    expect(status.hasConflict).toBe(false);
  });

  test("reports conflict when the target file was modified on main", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    repo.simulateConflictingMainEdit(prNumber);
    const status = await repo.checkConflict(prNumber);
    expect(status.mainAdvanced).toBe(true);
    expect(status.hasConflict).toBe(true);
  });
});

describe("keepMineOnConflict", () => {
  test("bumps the branch file sha, leaves the Submission open", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    const before = repo.pendingPRs()[0]!.file.sha;
    await repo.keepMineOnConflict(prNumber);
    const after = repo.pendingPRs()[0]!.file.sha;
    expect(after).not.toBe(before);
    expect(repo.pendingPRs()).toHaveLength(1);
  });
});

describe("useMainOnConflict", () => {
  test("closes the Submission without writing to main", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    await repo.useMainOnConflict(prNumber);
    expect(repo.pendingPRs()).toHaveLength(0);
    expect(repo.mainFiles()).toHaveLength(0);
  });
});

describe("submitMergedContent", () => {
  test("rewrites the branch file with new MDX, bumps sha", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    const before = repo.pendingPRs()[0]!.file.sha;
    await repo.submitMergedContent({
      prNumber,
      frontmatter: { title: "Merged" },
      body: "merged body",
    });
    const after = repo.pendingPRs()[0]!;
    expect(after.file.sha).not.toBe(before);
    expect(after.file.content).toContain("Merged");
    expect(after.file.content).toContain("merged body");
  });

  test("leaves the Submission open for republish", async () => {
    const { prNumber } = await repo.submitTopicEdit(ARDUINO_TEMP);
    await repo.submitMergedContent({
      prNumber,
      frontmatter: { title: "Merged" },
      body: "body",
    });
    expect(repo.pendingPRs()).toHaveLength(1);
  });
});

describe("createRoadmap", () => {
  test("scaffolds index, meta.json, and roadmap metadata directly on main", async () => {
    const ref = await repo.createRoadmap({
      slug: "figma",
      title: "Figma",
      description: "Design tool",
    });
    expect(ref.prNumber).toBeGreaterThan(0);
    const paths = repo.mainFiles().map((f) => f.path);
    expect(paths).toContain("apps/fumadocs/content/docs/figma/index.mdx");
    expect(paths).toContain("apps/fumadocs/content/docs/figma/meta.json");
    expect(paths).toContain("apps/fumadocs/content/roadmaps/figma.mdx");
  });

  test("raises ContentAlreadyExistsError when the Roadmap exists", async () => {
    await repo.createRoadmap({ slug: "figma", title: "Figma" });
    await expect(
      repo.createRoadmap({ slug: "figma", title: "Figma" }),
    ).rejects.toBeInstanceOf(ContentAlreadyExistsError);
  });
});

describe("createTrack", () => {
  test("scaffolds track index and meta.json directly on main", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    const paths = repo.mainFiles().map((f) => f.path);
    expect(paths).toContain(
      "apps/fumadocs/content/docs/arduino/sensors/index.mdx",
    );
    expect(paths).toContain(
      "apps/fumadocs/content/docs/arduino/sensors/meta.json",
    );
  });

  test("raises ContentAlreadyExistsError when the Track exists", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    await expect(
      repo.createTrack({
        roadmap: "arduino",
        trackSlug: "sensors",
        trackTitle: "Sensors",
      }),
    ).rejects.toBeInstanceOf(ContentAlreadyExistsError);
  });
});

describe("createTopic", () => {
  test("opens a Submission with default frontmatter; nothing on main", async () => {
    const ref = await repo.createTopic({
      roadmap: "arduino",
      slug: "temperature",
      track: "sensors",
    });
    expect(ref.prNumber).toBeGreaterThan(0);
    expect(repo.pendingPRs()).toHaveLength(1);
    expect(repo.pendingPRs()[0]!.file.content).toContain("Temperature");
    expect(repo.mainFiles()).toHaveLength(0);
  });

  test("raises ContentAlreadyExistsError when the Topic exists on main", async () => {
    repo.seedMainFile(
      { roadmap: "arduino", slug: "temperature", track: "sensors" },
      "existing",
    );
    await expect(
      repo.createTopic({ roadmap: "arduino", slug: "temperature", track: "sensors" }),
    ).rejects.toBeInstanceOf(ContentAlreadyExistsError);
  });
});

describe("deleteTopic", () => {
  test("removes a Topic that exists on main", async () => {
    const coords = { roadmap: "arduino", slug: "temperature", track: "sensors" };
    repo.seedMainFile(coords, "body");
    await repo.deleteTopic(coords);
    expect(repo.mainFiles()).toHaveLength(0);
  });

  test("raises ContentNotFoundError when Topic is missing", async () => {
    await expect(
      repo.deleteTopic({ roadmap: "arduino", slug: "missing", track: "sensors" }),
    ).rejects.toBeInstanceOf(ContentNotFoundError);
  });
});

describe("deleteTrack", () => {
  test("removes every file under the Track directory", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    const result = await repo.deleteTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
    });
    expect(result.deletedFiles).toBeGreaterThan(0);
    const trackFilesStillPresent = repo
      .mainFiles()
      .filter((f) => f.path.includes("/arduino/sensors/"));
    expect(trackFilesStillPresent).toHaveLength(0);
  });

  test("raises ContentNotFoundError when Track is missing", async () => {
    await expect(
      repo.deleteTrack({ roadmap: "arduino", trackSlug: "missing" }),
    ).rejects.toBeInstanceOf(ContentNotFoundError);
  });
});

describe("deleteRoadmap", () => {
  test("removes the Roadmap directory and roadmap metadata mdx", async () => {
    await repo.createRoadmap({ slug: "figma", title: "Figma" });
    const result = await repo.deleteRoadmap("figma");
    expect(result.deletedFiles).toBeGreaterThan(0);
    const figmaFiles = repo
      .mainFiles()
      .filter((f) => f.path.includes("/figma/") || f.path.endsWith("/figma.mdx"));
    expect(figmaFiles).toHaveLength(0);
  });

  test("raises ContentNotFoundError when Roadmap is missing", async () => {
    await expect(repo.deleteRoadmap("missing")).rejects.toBeInstanceOf(
      ContentNotFoundError,
    );
  });
});

function readMetaPages(repo: FakeContentRepository, metaPath: string): string[] {
  const file = repo.mainFiles().find((f) => f.path === metaPath)!;
  return JSON.parse(file.content).pages;
}

describe("reorderTracksInRoadmap", () => {
  test("rewrites the roadmap meta.json pages array, pinning index first", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "communication",
      trackTitle: "Communication",
    });
    // Seed the roadmap meta.json with the two new tracks
    const roadmapMeta = "apps/fumadocs/content/docs/arduino/meta.json";
    const seeded = repo
      .mainFiles()
      .find((f) => f.path === roadmapMeta);
    expect(seeded).toBeDefined();
    // Manually patch meta.json to include the tracks (Fake's create doesn't
    // patch parent meta.json — that's an Octokit-side concern, not modelled
    // here). For this test, replace the pages list explicitly.
    repo.mainFiles().find((f) => f.path === roadmapMeta)!.content = JSON.stringify(
      { title: "Arduino", pages: ["index", "sensors", "communication"] },
      null,
      2,
    ) + "\n";

    await repo.reorderTracksInRoadmap({
      roadmap: "arduino",
      orderedTrackSlugs: ["communication", "sensors"],
    });

    expect(readMetaPages(repo, roadmapMeta)).toEqual([
      "index",
      "communication",
      "sensors",
    ]);
  });

  test("untouched tracks remain after the explicit order", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    const roadmapMeta = "apps/fumadocs/content/docs/arduino/meta.json";
    repo.mainFiles().find((f) => f.path === roadmapMeta)!.content = JSON.stringify(
      { title: "Arduino", pages: ["index", "a", "b", "c", "d"] },
      null,
      2,
    ) + "\n";

    await repo.reorderTracksInRoadmap({
      roadmap: "arduino",
      orderedTrackSlugs: ["c", "a"],
    });

    expect(readMetaPages(repo, roadmapMeta)).toEqual([
      "index",
      "c",
      "a",
      "b",
      "d",
    ]);
  });
});

describe("listContent", () => {
  test("groups published files by Roadmap; pending edits override state", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    // Submit an edit to the track's index — should show pending_review on the list.
    await repo.submitTopicEdit({
      coords: { roadmap: "arduino", slug: "index", track: "sensors" },
      frontmatter: { title: "Sensors (edited)" },
      body: "",
    });

    const groups = await repo.listContent();
    const arduino = groups.find((g) => g.roadmap === "arduino");
    expect(arduino).toBeDefined();

    const sensorsIndex = arduino!.files.find(
      (f) => f.track === "sensors" && f.slug === "index",
    );
    expect(sensorsIndex?.state).toBe("pending_review");
    expect(sensorsIndex?.title).toBe("Sensors (edited)");
  });

  test("surfaces pending Topics whose file does not exist on main", async () => {
    await repo.submitTopicEdit({
      coords: { roadmap: "figma", slug: "components", track: "ui" },
      frontmatter: { title: "Components" },
      body: "",
    });
    const groups = await repo.listContent();
    const figma = groups.find((g) => g.roadmap === "figma");
    expect(figma).toBeDefined();
    expect(figma!.files).toHaveLength(1);
    expect(figma!.files[0]!.state).toBe("pending_review");
  });
});

describe("listPendingSubmissions", () => {
  test("returns one row per open Submission", async () => {
    const a = await repo.submitTopicEdit({
      coords: { roadmap: "arduino", slug: "temperature", track: "sensors" },
      frontmatter: { title: "Temperature" },
      body: "",
    });
    await repo.submitTopicEdit({
      coords: { roadmap: "arduino", slug: "humidity", track: "sensors" },
      frontmatter: { title: "Humidity" },
      body: "",
    });
    const rows = await repo.listPendingSubmissions();
    expect(rows).toHaveLength(2);
    const tempRow = rows.find((r) => r.prNumber === a.prNumber);
    expect(tempRow?.title).toBe("Temperature");
    expect(tempRow?.filePath).toContain("temperature.mdx");
  });
});

describe("getTopic", () => {
  test("returns the main version when no open Submission exists", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    const view = await repo.getTopic({ roadmap: "arduino", slug: "index" });
    expect(view.state).toBe("published");
    expect(view.frontmatter.title).toBe("Arduino");
  });

  test("returns the pending version with mainBody for diffing", async () => {
    const coords = { roadmap: "arduino", slug: "temperature", track: "sensors" };
    repo.seedMainFile(coords, serializeMdxForTests({ title: "Old Temperature" }, "old body"));
    await repo.submitTopicEdit({
      coords,
      frontmatter: { title: "New Temperature" },
      body: "new body",
    });

    const view = await repo.getTopic(coords);
    expect(view.state).toBe("pending_review");
    expect(view.frontmatter.title).toBe("New Temperature");
    expect(view.body).toBe("new body");
    expect(view.mainBody).toBe("old body");
    expect(view.changeRecord).toBeDefined();
  });

  test("throws ContentNotFoundError when nothing exists on main or in a Submission", async () => {
    await expect(
      repo.getTopic({ roadmap: "ghost", slug: "missing" }),
    ).rejects.toBeInstanceOf(ContentNotFoundError);
  });
});

describe("reorderTopicsInTrack", () => {
  test("rewrites the track meta.json pages array, pinning index first", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    const trackMeta = "apps/fumadocs/content/docs/arduino/sensors/meta.json";
    repo.mainFiles().find((f) => f.path === trackMeta)!.content = JSON.stringify(
      { title: "Sensors", pages: ["index", "temperature", "humidity", "light"] },
      null,
      2,
    ) + "\n";

    await repo.reorderTopicsInTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      orderedTopicSlugs: ["light", "temperature", "humidity"],
    });

    expect(readMetaPages(repo, trackMeta)).toEqual([
      "index",
      "light",
      "temperature",
      "humidity",
    ]);
  });

  test("no-op when order is unchanged", async () => {
    await repo.createRoadmap({ slug: "arduino", title: "Arduino" });
    await repo.createTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      trackTitle: "Sensors",
    });
    const trackMeta = "apps/fumadocs/content/docs/arduino/sensors/meta.json";
    const before = repo.mainFiles().find((f) => f.path === trackMeta)!.content;

    await repo.reorderTopicsInTrack({
      roadmap: "arduino",
      trackSlug: "sensors",
      orderedTopicSlugs: ["index"],
    });

    const after = repo.mainFiles().find((f) => f.path === trackMeta)!.content;
    expect(after).toBe(before);
  });
});
