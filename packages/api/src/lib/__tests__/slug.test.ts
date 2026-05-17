import { describe, expect, it } from "bun:test";

import { SLUG_PATTERN, isValidSlug, slugToTitle, titleToSlug } from "../slug";

describe("slugToTitle", () => {
  it("title-cases a single word", () => {
    expect(slugToTitle("arduino")).toBe("Arduino");
  });

  it("replaces hyphens with spaces and title-cases each word", () => {
    expect(slugToTitle("sensors-and-input")).toBe("Sensors And Input");
  });

  it("handles numbers", () => {
    expect(slugToTitle("step-1-intro")).toBe("Step 1 Intro");
  });

  it("returns empty string for empty input", () => {
    expect(slugToTitle("")).toBe("");
  });
});

describe("titleToSlug", () => {
  it("lowercases and hyphenates a basic title", () => {
    expect(titleToSlug("Sensors and Input")).toBe("sensors-and-input");
  });

  it("strips punctuation", () => {
    expect(titleToSlug("Hello, World!")).toBe("hello-world");
  });

  it("collapses repeated whitespace and hyphens", () => {
    expect(titleToSlug("foo    bar---baz")).toBe("foo-bar-baz");
  });

  it("trims leading and trailing hyphens", () => {
    expect(titleToSlug("  --hello--  ")).toBe("hello");
  });

  it("preserves digits", () => {
    expect(titleToSlug("Step 1: Intro")).toBe("step-1-intro");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(titleToSlug("   ")).toBe("");
  });
});

describe("isValidSlug / SLUG_PATTERN", () => {
  it("accepts lowercase, digits, and hyphens", () => {
    expect(isValidSlug("foo-bar-1")).toBe(true);
    expect(SLUG_PATTERN.test("foo-bar-1")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(isValidSlug("Foo")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidSlug("foo bar")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidSlug("")).toBe(false);
  });

  it("rejects underscores and other punctuation", () => {
    expect(isValidSlug("foo_bar")).toBe(false);
    expect(isValidSlug("foo.bar")).toBe(false);
  });
});
