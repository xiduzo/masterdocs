# Domain language

Authoritative names and definitions for concepts in this codebase. Use these terms exactly — do not drift into synonyms (`page` for Topic, `section` for Track, `module` for Roadmap, etc.). Code, comments, commits, PRs, and conversation should all speak the same language.

## Content hierarchy

- **Roadmap** — A curated learning path (e.g. Arduino, Figma) composed of ordered Tracks. Lives at `apps/fumadocs/content/docs/<roadmap>/`. Roadmap metadata (title, description) is held in a separate file at `apps/fumadocs/content/roadmaps/<roadmap>.mdx`.
- **Track** — A grouped section within a Roadmap (e.g. "Sensors and Input"). Lives at `apps/fumadocs/content/docs/<roadmap>/<track>/`.
- **Topic** — An individual documentation page within a Track. A `.mdx` file at `apps/fumadocs/content/docs/<roadmap>/<track>/<topic>.mdx`. Contains learnable Skills.
- **Skill** — A granular checkpoint within a Topic that users mark complete. Declared in MDX via `<Skill id="..." label="..." />`. Skill IDs are unique within a Roadmap.
- **Progress** — A user's per-Skill completion state. Persisted server-side in `skill_progress`, synced across web, docs, and (eventually) native apps.

## Content structure source of truth

The Roadmap → Track → Topic hierarchy is derived from filesystem path and `meta.json`, **not** from MDX frontmatter. A Topic's frontmatter carries only `title` (required) and `description` (optional). See [ADR-0001](docs/adr/0001-content-structure-source.md).

## Content authoring lifecycle

The admin editor in `apps/web` proposes Topic edits via GitHub pull requests against the `main` branch.

- **Submission** — A pending change to content, backed by a PR + branch. Two flavours:
  - **Topic-edit Submission** — opened by `submitTopicEdit` against a single Topic. Branch name is *deterministic* (`content/<roadmap>/[<track>/]<topic>` via `contentBranchName`), so re-submitting the same Topic coalesces onto the existing PR. The Topic is then in `state: "pending_review"` until published or discarded.
  - **Scaffold Submission** — opened by `createRoadmap` / `createTrack`. Branch name is *timestamped* (`content/<slug>-<ms>`) — every call opens a fresh Submission. Auto-merged on creation; only persists if auto-merge fails.
  - `createTopic` is a hybrid: deterministic branch like a Topic-edit Submission, but no auto-merge — it stays `pending_review`.
- **Publication** — Merging a Submission's PR. For Topic-edit Submissions the Topic transitions to `state: "published"`; for Scaffold Submissions the new Roadmap/Track appears on `main`.
- **Discard** — Closing the Submission's PR and deleting the branch. Returns the content to its prior state.
- **Conflict** — `main` has advanced and modified the same Topic file while a Topic-edit Submission was open. Resolved via one of three explicit verbs: `keepMineOnConflict`, `useMainOnConflict`, or `submitMergedContent`.

Operations that don't carry editorial risk (reorder, delete) write directly to `main` without a PR.

## Architectural concepts

These name the seams the codebase is converging on. Some are in flight (see `ARCHITECTURE_PROPOSAL.md` and the current refactor plan).

- **ContentRepository** — The deep module behind which every Roadmap/Track/Topic mutation routes. Hides GitHub branch naming, file path construction, `meta.json` patching, PR creation, auto-merge, and cache invalidation behind verbs phrased in this glossary (`submitTopicEdit`, `publishTopic`, `createRoadmap`, `reorderTopics`, etc.). Two adapters: `OctokitContentRepository` (production, wraps `CachedGitHubService`) and `FakeContentRepository` (in-memory, for tests).
- **RoadmapTree** — The pure function `buildRoadmapTree` that produces a canonical `Roadmap` aggregate. Has two adapters: `fromFsWalk` (server, used by the progress router) and `fromContentList` (admin client, fed by `content.list` output). Single home for the grouping logic that is currently reimplemented three times.
- **ContentMutation** — The hook `useContentMutation` that owns the client-cache lifecycle for every Submission verb: optional optimistic patch over the `content.list` cache → rollback on error → invalidate the four content query keys (`content.list`, `content.get`, `content.listPending`, `content.checkConflict`) on settle → success/error toasts. Callsites describe **what** changes (`optimistic`) and **what** to say (`successMessage`/`errorPrefix`); the hook owns **how** to wire the ceremony. `optimistic` is optional — verbs without a natural list patch (`create*`, `delete*`, `reorder`) still get invalidation + toasts.
- **RoadmapEditor** — The hook `useRoadmapEditor(roadmap)` that owns the Scaffold Submission verbs for a single Roadmap (`reorderTracks`, `reorderTopicsInTrack`, `createTrack`, `createTopic`) plus the derived tree view (`tracks`, `roadmapTitle`) from `content.list`. Display components (drag handles, sortable rows, inline inputs) receive verbs as callbacks and stay free of `content.list` cache shape, mutation wiring, and slug derivation.
- **CacheInvalidator** — Already exists on `CachedGitHubService.invalidate` (see `packages/api/src/lib/github-cache.ts`). Today the router triggers invalidation explicitly after every write. Under the `ContentRepository` refactor, the repo owns triggering — it knows what it touched.
