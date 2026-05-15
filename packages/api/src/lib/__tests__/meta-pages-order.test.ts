import { describe, expect, test } from "bun:test";

import { orderByMetaPages } from "../meta-pages-order";

const id = (s: string) => s;

describe("orderByMetaPages", () => {
  test("undefined metaPages returns entries unchanged", () => {
    expect(orderByMetaPages(["a", "b", "c"], undefined, id)).toEqual(["a", "b", "c"]);
  });

  test("empty metaPages returns entries unchanged", () => {
    expect(orderByMetaPages(["a", "b", "c"], [], id)).toEqual(["a", "b", "c"]);
  });

  test("exact match reorders entries to meta order", () => {
    expect(orderByMetaPages(["b", "a", "c"], ["a", "b", "c"], id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("meta references missing entries are silently skipped", () => {
    expect(orderByMetaPages(["a", "b"], ["a", "ghost", "b"], id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("entries not in meta are appended in input order", () => {
    expect(
      orderByMetaPages(["c", "a", "b", "d"], ["a", "b"], id),
    ).toEqual(["a", "b", "c", "d"]);
  });

  test("partial meta places listed first, rest trails", () => {
    expect(
      orderByMetaPages(["c", "b", "a"], ["b"], id),
    ).toEqual(["b", "c", "a"]);
  });

  test("works with object entries via key fn", () => {
    type E = { slug: string };
    const entries: E[] = [{ slug: "y" }, { slug: "x" }, { slug: "z" }];
    expect(
      orderByMetaPages(entries, ["x", "y"], (e) => e.slug),
    ).toEqual([{ slug: "x" }, { slug: "y" }, { slug: "z" }]);
  });

  test("duplicate names in meta only consume the entry once", () => {
    expect(orderByMetaPages(["a", "b"], ["a", "a", "b"], id)).toEqual([
      "a",
      "b",
    ]);
  });
});
