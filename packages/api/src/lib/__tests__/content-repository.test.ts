import { beforeEach, describe, expect, test } from "bun:test";

import { ContentMergeConflictError } from "../content-repository";
import { FakeContentRepository } from "../fake-content-repository";

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
