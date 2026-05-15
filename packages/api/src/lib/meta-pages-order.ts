/**
 * Apply a `meta.json` `pages: [...]` ordering to a list of entries.
 *
 * Entries whose key appears in `metaPages` are placed first, in the
 * order they appear there. Entries not referenced by `metaPages` are
 * appended in their original input order. References in `metaPages`
 * that don't match any entry are silently skipped.
 *
 * Mirrors the write-side `patchMetaPages` helper: forgiving on both
 * sides keeps the listing self-healing when `meta.json` drifts from
 * the on-disk file set.
 */
export function orderByMetaPages<T>(
  entries: readonly T[],
  metaPages: readonly string[] | undefined,
  key: (entry: T) => string,
): T[] {
  if (!metaPages?.length) return [...entries];

  const byKey = new Map<string, T>();
  for (const entry of entries) {
    byKey.set(key(entry), entry);
  }

  const ordered: T[] = [];
  const consumed = new Set<string>();
  for (const name of metaPages) {
    const entry = byKey.get(name);
    if (entry !== undefined && !consumed.has(name)) {
      ordered.push(entry);
      consumed.add(name);
    }
  }

  const leftover = entries.filter((e) => !consumed.has(key(e)));
  return [...ordered, ...leftover];
}
