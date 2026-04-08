# Implementation Plan: MDX Content Editor

## Overview

Build a GitHub-backed MDX content editor for the web app. Implementation proceeds bottom-up: database schema and env config → pure utility functions (MDX parser, slug validation) → GitHub service → content tRPC router → editor UI components. Each layer is tested before moving to the next.

## Tasks

- [x] 1. Database schema and environment configuration
  - [x] 1.1 Add `role` column to user table and create `change_records` schema
    - Add `role: text("role", { enum: ["user", "admin"] }).notNull().default("user")` to the `user` table in `packages/db/src/schema/auth.ts`
    - Create `packages/db/src/schema/change-records.ts` with the `changeRecords` table (id, userId, filePath, branchName, prNumber, baseCommitSha, status, timestamps, indexes)
    - Add relations for `changeRecords` (user relation)
    - Export the new schema from `packages/db/src/schema/index.ts`
    - Run `bun run db:generate` and `bun run db:push` to apply the migration
    - _Requirements: 1.1, 8.5, 11.1_

  - [x] 1.2 Add GitHub environment variables to server env validation
    - Add `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` as optional string fields in `packages/env/src/server.ts`
    - _Requirements: 2.1, 2.2_

- [x] 2. MDX parser/serializer and slug validation utilities
  - [x] 2.1 Implement `parseMdx` and `serializeMdx` in `packages/api/src/lib/mdx.ts`
    - Install `yaml` package in `packages/api`
    - Implement `parseMdx(raw)`: split on `---` delimiters, YAML-parse frontmatter, extract body (strip leading blank line)
    - Implement `serializeMdx(frontmatter, body)`: YAML-stringify frontmatter between `---` delimiters, blank line, then body
    - Define and export `MdxFrontmatter` type (title, description?, roadmap?, track?, trackTitle?, trackOrder?, topicOrder?)
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ]* 2.2 Write property test for MDX round-trip serialization
    - **Property 1: MDX Serialization Round-Trip**
    - **Validates: Requirements 14.1, 14.2, 14.3**
    - Use `fast-check` to generate arbitrary `MdxFrontmatter` objects and body strings
    - Assert `parseMdx(serializeMdx(frontmatter, body))` equals `{ frontmatter, body }`
    - Test file: `packages/api/src/lib/__tests__/mdx.property.test.ts`

  - [x] 2.3 Implement `isValidSlug` in `packages/api/src/lib/mdx.ts`
    - Validate slug matches `/^[a-z0-9-]+$/` (lowercase alphanumeric + hyphens, non-empty)
    - _Requirements: 9.2_

  - [ ]* 2.4 Write property test for slug validation
    - **Property 2: Slug Validation Correctness**
    - **Validates: Requirements 9.2**
    - Use `fast-check` to generate arbitrary strings
    - Assert `isValidSlug(s)` returns true iff `s` matches `/^[a-z0-9-]+$/`
    - Test file: `packages/api/src/lib/__tests__/slug.property.test.ts`

  - [ ]* 2.5 Write unit tests for MDX parser/serializer edge cases
    - Test empty body, no optional frontmatter fields, body containing `---`, special YAML characters
    - Test serializer output format matches expected strings
    - Test file: `packages/api/src/lib/__tests__/mdx.test.ts`
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. GitHub Service
  - [x] 4.1 Implement GitHub Service in `packages/api/src/lib/github.ts`
    - Install `@octokit/rest` in `packages/api`
    - Create a factory function that reads `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` from env and returns an object implementing the `GitHubService` interface
    - Implement tree operations: `getDirectoryTree(path, branch?)`, `getFileContent(path, branch?)`
    - Implement branch operations: `getMainHeadSha()`, `createBranch(name, sha)`, `deleteBranch(name)`
    - Implement commit operations: `createOrUpdateFile({ path, content, message, branch, sha? })`
    - Implement PR operations: `createPullRequest({ title, body, head, base })`, `mergePullRequest(prNumber, mergeMethod)`, `closePullRequest(prNumber)`
    - Implement conflict detection: `getCommitSha(branch)`, `compareCommits(base, head)`
    - Wrap Octokit errors with descriptive messages (auth failures, 404s, rate limits)
    - _Requirements: 2.3, 2.4, 2.5, 13.1, 13.2_

- [x] 5. Content tRPC Router
  - [x] 5.1 Create `adminProcedure` middleware and content router skeleton
    - Create `packages/api/src/routers/content.ts`
    - Define `adminProcedure` extending `protectedProcedure` with role check (`ctx.session.user.role !== "admin"` → FORBIDDEN)
    - Wire the content router into `appRouter` in `packages/api/src/routers/index.ts`
    - Update Better Auth config in `packages/auth` to expose `role` field on the session user object
    - _Requirements: 1.4, 1.5_

  - [x] 5.2 Implement `content.list` query
    - Use GitHub Service `getDirectoryTree` to read `apps/fumadocs/content/docs/` from main
    - For each MDX file, fetch content and parse frontmatter to extract title
    - Group files by roadmap directory, include slug, title, path, and state (check for pending `change_records`)
    - _Requirements: 3.1, 3.2, 3.5, 13.1_

  - [x] 5.3 Implement `content.get` query
    - Accept `roadmap`, `slug`, optional `fromBranch` flag
    - Build file path: `apps/fumadocs/content/docs/{roadmap}/{slug}.mdx`
    - If `fromBranch` and a pending `change_record` exists, read from feature branch; otherwise read from main
    - Parse MDX, return frontmatter, body, state, changeRecord details, fileSha
    - Handle 404 with `TRPCError({ code: "NOT_FOUND" })`
    - _Requirements: 3.3, 11.3, 13.2, 13.8_

  - [x] 5.4 Implement `content.submit` mutation
    - Validate frontmatter title is non-empty
    - Serialize MDX from frontmatter + body
    - Get main HEAD SHA, create branch (`content/<slug>-<timestamp>`), commit file, create PR
    - Insert `change_record` in database
    - Return `{ prNumber, branchName }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 13.3_

  - [x] 5.5 Implement `content.create` mutation
    - Validate slug with `isValidSlug`
    - Check if file already exists on main (→ CONFLICT error if so)
    - Create branch, commit new MDX file with default frontmatter (title from slug), create PR
    - Insert `change_record`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 13.4_

  - [x] 5.6 Implement `content.publish` mutation
    - Look up `change_record` by ID, verify status is `pending_review`
    - Merge PR using merge commit strategy
    - Update `change_record` status to `published`, delete feature branch
    - Handle merge conflict → return `TRPCError({ code: "CONFLICT" })`
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 13.5_

  - [x] 5.7 Implement `content.discard` mutation
    - Close PR, delete branch, delete `change_record`
    - _Requirements: 11.4, 13.6_

  - [x] 5.8 Implement `content.checkConflict` and `content.resolveConflict`
    - `checkConflict`: compare main HEAD with `change_record.baseCommitSha`, check if same file modified
    - `resolveConflict`: handle `keep_mine` (update file on branch), `use_main` (close PR, delete branch/record), `manual` (commit manual content to branch)
    - _Requirements: 12.1, 12.2, 12.5, 12.6, 12.7, 13.7_

- [x] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Editor UI — Layout, routing, and sidebar
  - [-] 7.1 Create admin content route layout with auth guard
    - Create `apps/web/src/routes/admin/content/route.tsx` as a layout route
    - Add `beforeLoad` guard: redirect unauthenticated users to `/login`, show "Access Denied" for non-admin users
    - Render sidebar + `<Outlet />` in a split-pane layout
    - _Requirements: 1.2, 1.3_

  - [~] 7.2 Implement `ContentSidebar` component
    - Create `apps/web/src/components/content/sidebar.tsx`
    - Fetch content list via `trpc.content.list.useQuery()`
    - Render collapsible roadmap groups with file links
    - Show visual indicator (badge/dot) for files with `pending_review` state
    - Include "New File" button and "Pending Changes" link
    - _Requirements: 3.1, 3.4, 3.5_

  - [~] 7.3 Create content index route
    - Create `apps/web/src/routes/admin/content/index.tsx`
    - Display a welcome/instructions view when no file is selected
    - _Requirements: 3.1_

- [ ] 8. Editor UI — File editing interface
  - [~] 8.1 Implement `ContentEditor` route component
    - Create `apps/web/src/routes/admin/content/$roadmap.$slug.tsx`
    - Fetch file data via `trpc.content.get.useQuery({ roadmap, slug })`
    - Orchestrate `FrontmatterForm`, `BodyEditor`, `PreviewPanel`, and action buttons (Submit, Publish, Discard)
    - Show conflict warning when `checkConflict` detects stale content
    - _Requirements: 3.3, 8.6, 10.4, 10.6, 12.2_

  - [~] 8.2 Implement `FrontmatterForm` component
    - Create `apps/web/src/components/content/frontmatter-form.tsx`
    - Render form fields: title (required), description, roadmap, track, trackTitle, trackOrder, topicOrder (all optional)
    - Pre-populate from loaded frontmatter data
    - Validate title is non-empty on change
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [~] 8.3 Implement `BodyEditor` component with CodeMirror
    - Create `apps/web/src/components/content/body-editor.tsx`
    - Install `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/language` in `apps/web`
    - Set up CodeMirror 6 editor with Markdown syntax highlighting
    - Add toolbar buttons: H2, H3, bold, italic, link, unordered list, code block
    - Toolbar actions insert/wrap Markdown syntax at cursor position
    - Preserve existing MDX component syntax during editing
    - Expose a ref/callback for cursor position (used by ComponentInserter)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [~] 8.4 Implement `PreviewPanel` component
    - Create `apps/web/src/components/content/preview-panel.tsx`
    - Install `react-markdown` and `remark-gfm` in `apps/web`
    - Render body content as HTML with standard Markdown formatting
    - Map `<Skill>` to a styled placeholder showing the label
    - Map `<YouTube>` to a styled placeholder showing the video ID
    - Debounce preview updates to 300ms after input pause
    - Add toggle button to show/hide the preview panel
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [~] 8.5 Implement `ComponentInserter` component
    - Create `apps/web/src/components/content/component-inserter.tsx`
    - "Insert Skill" button → dialog with `id` and `label` fields (both required)
    - "Insert YouTube" button → dialog with `id` field (required)
    - On submit, insert the component JSX string at the current cursor position in BodyEditor
    - Validate all required fields are non-empty before insertion
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9. Editor UI — New file, pending changes, and conflict resolution
  - [~] 9.1 Implement `NewFileDialog` component
    - Create `apps/web/src/components/content/new-file-dialog.tsx`
    - Prompt for roadmap directory (select from existing or enter new) and file slug
    - Call `trpc.content.create.useMutation()` on submit
    - On success, navigate to the new file's editor route
    - _Requirements: 9.1, 9.5_

  - [~] 9.2 Implement `PendingChanges` route
    - Create `apps/web/src/routes/admin/content/pending.tsx`
    - List all `change_records` with `pending_review` status
    - Display file path, submitter, timestamp, PR number for each entry
    - Click to navigate to the file editor (with `fromBranch` flag)
    - Allow discarding a pending change from this view
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [~] 9.3 Implement `ConflictResolver` component
    - Create `apps/web/src/components/content/conflict-resolver.tsx`
    - Show side-by-side view of main version vs submitted version
    - Provide three resolution options: "Keep my changes", "Use latest from main", "Edit manually"
    - Wire each option to `trpc.content.resolveConflict.useMutation()` with the appropriate strategy
    - For "Edit manually", load both versions into adjacent panels for manual merging, then re-submit
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7_

- [~] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the two correctness properties from the design (MDX round-trip and slug validation)
- The implementation language is TypeScript throughout, matching the design document
