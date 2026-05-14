# ADR-0001: Track/Topic structure is sourced from FS path + meta.json

- **Date**: 2026-05-14
- **Status**: Accepted

## Context

The codebase has two conflicting models for where the Roadmap → Track → Topic hierarchy lives.

**Frontmatter-driven.** `.kiro/specs/interactive-learning-roadmaps/design.md` ("Content-driven structure over database-driven") and `apps/fumadocs/src/lib/validate-roadmap-content.ts` both assume each Topic MDX file carries `roadmap`, `track`, `trackTitle`, `trackOrder`, and `topicOrder` in YAML frontmatter. The validator blocks builds when those fields are missing.

**Path + meta.json driven.** `packages/api/src/routers/content.ts` and `packages/api/src/lib/roadmap-content.ts` ignore those fields entirely. Roadmap and Track membership are inferred from a Topic's location under `apps/fumadocs/content/docs/<roadmap>/<track>/<topic>.mdx`. Track and Topic ordering is read from `meta.json` `pages` arrays at the Roadmap and Track levels. `packages/api/src/lib/mdx.ts::serializeMdx` writes back only `title` and `description`, silently dropping any other frontmatter fields on save.

Both models are partially implemented. The admin editor uses the path model; the build-time validator enforces the frontmatter model. Editing any Topic via the admin UI strips the validator's required fields, which would cause subsequent builds to fail — an unreported latent bug.

## Decision

The canonical source of truth for the Roadmap → Track → Topic hierarchy is **the filesystem path and `meta.json`**.

- Folder structure `apps/fumadocs/content/docs/<roadmap>/<track>/<topic>.mdx` encodes Roadmap and Track membership.
- `<roadmap>/meta.json` `pages: [...]` encodes Track order within a Roadmap.
- `<roadmap>/<track>/meta.json` `pages: [...]` encodes Topic order within a Track.
- Topic MDX frontmatter carries only display metadata: `title` (required) and `description` (optional).
- The `MdxFrontmatter` interface in `packages/api/src/lib/mdx.ts` is tightened to `{ title: string; description?: string }` and treated as a strict zod schema.

## Consequences

- `validate-roadmap-content.ts`'s `ROADMAP_FIELDS` check and the frontmatter parsing for `roadmap`/`track`/`trackTitle`/`trackOrder`/`topicOrder` are **dead code** under this model and will be removed in Phase 1 of the architecture refactor.
- `serializeMdx`'s drop of non-canonical frontmatter fields is **correct behaviour** under this model, not a bug. The unreported latent bug above is dissolved by this decision rather than fixed by code.
- Existing Topic MDX files that carry the extra fields will have those fields stripped the next time the Topic is saved through the admin editor. No data migration script is required.
- The `RoadmapTree` builder (architecture refactor Phase 2) has two adapters: `fromFsWalk` (server, used by the progress router) and `fromContentList` (admin client, fed by `content.list`). Both produce the same `Roadmap` aggregate.
- Build-time validation narrows in scope from "frontmatter shape" to "slug correctness, `<Skill>` ID uniqueness, file/meta.json consistency."

## Alternatives considered

### Frontmatter-driven

Each MDX file declares its own Roadmap, Track, and order. Source-locality wins: opening a single file tells you where it belongs. **Rejected** because:

- Reorder operations would require rewriting N files instead of bumping one `meta.json`.
- Two sources of truth (frontmatter + path) invite drift — already confirmed by the current latent bug.
- `content.ts` and `roadmap-content.ts` already encode the path model end-to-end and would need to be torn out and rewritten.

### Hybrid (path for membership, frontmatter for order)

Folder structure encodes Roadmap/Track membership; `trackOrder`/`topicOrder` in frontmatter encode display order. **Rejected** because:

- Still requires data migration (`meta.json` → frontmatter) for existing content.
- Reorder still costs N file rewrites.
- No clear architectural benefit over the pure path/meta.json model.

## References

- `packages/api/src/routers/content.ts` — full implementation of the path model.
- `packages/api/src/lib/roadmap-content.ts` — server-side FS walker.
- `apps/fumadocs/src/lib/validate-roadmap-content.ts` — frontmatter validator, to be pruned in Phase 1.
- `.kiro/specs/interactive-learning-roadmaps/design.md` § "Key Design Decisions" — the contradicting frontmatter-driven intent.
- `ARCHITECTURE_PROPOSAL.md` — predecessor architecture review (client-side focus).
