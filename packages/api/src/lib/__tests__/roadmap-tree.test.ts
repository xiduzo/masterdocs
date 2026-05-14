import { describe, expect, test } from "bun:test";

import {
  allSkillIds,
  buildRoadmapTree,
  fromContentList,
  type ContentListGroup,
} from "../roadmap-tree";

const META = { slug: "arduino", title: "Arduino" };

describe("buildRoadmapTree", () => {
  test("empty input produces empty rootTopics and tracks", () => {
    const r = buildRoadmapTree(META, []);
    expect(r.slug).toBe("arduino");
    expect(r.title).toBe("Arduino");
    expect(r.rootTopics).toEqual([]);
    expect(r.tracks).toEqual([]);
  });

  test("topic with no track lands in rootTopics", () => {
    const r = buildRoadmapTree(META, [
      { slug: "index", title: "Arduino", skillIds: [] },
    ]);
    expect(r.rootTopics).toHaveLength(1);
    expect(r.rootTopics[0]!).toMatchObject({ slug: "index", order: 0 });
    expect(r.tracks).toEqual([]);
  });

  test("track-level index file creates the track entry without becoming a topic", () => {
    const r = buildRoadmapTree(META, [
      { slug: "index", title: "Sensors", track: "sensors", trackTitle: "Sensors" },
      { slug: "temperature", title: "Temperature", track: "sensors", skillIds: ["t1"] },
    ]);
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]!.slug).toBe("sensors");
    expect(r.tracks[0]!.title).toBe("Sensors");
    expect(r.tracks[0]!.topics.map((t) => t.slug)).toEqual(["temperature"]);
  });

  test("track-level files become topics, ordered by input position", () => {
    const r = buildRoadmapTree(META, [
      { slug: "temperature", title: "Temperature", track: "sensors" },
      { slug: "humidity", title: "Humidity", track: "sensors" },
      { slug: "light", title: "Light", track: "sensors" },
    ]);
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]!.topics.map((t) => t.slug)).toEqual([
      "temperature",
      "humidity",
      "light",
    ]);
    expect(r.tracks[0]!.topics.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  test("multiple tracks keep input order via Track.order", () => {
    const r = buildRoadmapTree(META, [
      { slug: "x", title: "X", track: "alpha" },
      { slug: "y", title: "Y", track: "beta" },
      { slug: "z", title: "Z", track: "gamma" },
    ]);
    expect(r.tracks.map((t) => t.slug)).toEqual(["alpha", "beta", "gamma"]);
    expect(r.tracks.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  test("track title defaults to humanized slug when trackTitle omitted", () => {
    const r = buildRoadmapTree(META, [
      { slug: "x", title: "X", track: "sensors-and-input" },
    ]);
    expect(r.tracks[0]!.title).toBe("Sensors And Input");
  });

  test("trackTitle is taken from the first occurrence and not overwritten", () => {
    const r = buildRoadmapTree(META, [
      { slug: "a", title: "A", track: "sensors", trackTitle: "Sensors and Input" },
      { slug: "b", title: "B", track: "sensors", trackTitle: "DIFFERENT (ignored)" },
    ]);
    expect(r.tracks[0]!.title).toBe("Sensors and Input");
  });

  test("topic skillIds aggregate into Track.skillIds preserving order", () => {
    const r = buildRoadmapTree(META, [
      { slug: "temperature", title: "T", track: "sensors", skillIds: ["t1", "t2"] },
      { slug: "humidity", title: "H", track: "sensors", skillIds: ["h1"] },
    ]);
    expect(r.tracks[0]!.skillIds).toEqual(["t1", "t2", "h1"]);
  });

  test("allSkillIds flattens rootTopics and every Track in order", () => {
    const r = buildRoadmapTree(META, [
      { slug: "index", title: "I", skillIds: ["root1"] },
      { slug: "a", title: "A", track: "t1", skillIds: ["t1a"] },
      { slug: "b", title: "B", track: "t2", skillIds: ["t2b"] },
    ]);
    expect(allSkillIds(r)).toEqual(["root1", "t1a", "t2b"]);
  });

  test("topic.state passes through unchanged", () => {
    const r = buildRoadmapTree(META, [
      { slug: "a", title: "A", track: "t1", state: "pending_review" },
      { slug: "b", title: "B", track: "t1", state: "published" },
    ]);
    expect(r.tracks[0]!.topics.map((t) => t.state)).toEqual([
      "pending_review",
      "published",
    ]);
  });
});

describe("fromContentList", () => {
  test("groups a content.list payload by track in input order", () => {
    const group: ContentListGroup = {
      roadmap: "arduino",
      files: [
        { slug: "index", title: "Arduino", state: "published" },
        { slug: "index", title: "Sensors", state: "published", track: "sensors", trackTitle: "Sensors" },
        { slug: "temperature", title: "Temperature", state: "published", track: "sensors" },
        { slug: "humidity", title: "Humidity", state: "pending_review", track: "sensors" },
      ],
    };
    const r = fromContentList(group);
    expect(r.slug).toBe("arduino");
    expect(r.rootTopics).toHaveLength(1);
    expect(r.rootTopics[0]!.slug).toBe("index");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]!.title).toBe("Sensors");
    expect(r.tracks[0]!.topics.map((t) => t.slug)).toEqual(["temperature", "humidity"]);
    expect(r.tracks[0]!.topics.map((t) => t.state)).toEqual([
      "published",
      "pending_review",
    ]);
  });

  test("title falls back to the root index file when no meta override", () => {
    const r = fromContentList({
      roadmap: "arduino",
      files: [
        { slug: "index", title: "Arduino Roadmap", state: "published" },
        { slug: "a", title: "A", state: "published", track: "t" },
      ],
    });
    expect(r.title).toBe("Arduino Roadmap");
  });

  test("title falls back to humanized slug when no index and no meta", () => {
    const r = fromContentList({
      roadmap: "interaction-design",
      files: [{ slug: "a", title: "A", state: "published", track: "t" }],
    });
    expect(r.title).toBe("Interaction Design");
  });

  test("explicit meta.title takes precedence over index file title", () => {
    const r = fromContentList(
      {
        roadmap: "arduino",
        files: [{ slug: "index", title: "Auto-derived", state: "published" }],
      },
      { title: "Real Title" },
    );
    expect(r.title).toBe("Real Title");
  });
});
