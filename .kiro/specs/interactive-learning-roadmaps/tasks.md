# Implementation Plan: Interactive Learning Roadmaps

## Overview

Incrementally build the interactive learning roadmap system on top of the existing Fumadocs + Hono/tRPC monorepo. Tasks progress from data layer → API → content schema → components → pages → navigation, ensuring each step builds on the previous and nothing is left unwired.

## Tasks

- [x] 1. Set up data layer: skill_progress schema and migration
  - [x] 1.1 Create `packages/db/src/schema/skill-progress.ts` with the `skillProgress` Drizzle table (id, userId FK to user, skillId, completedAt, unique constraint on userId+skillId, indexes)
  - Re-export from `packages/db/src/schema/index.ts`
  - Add `userRelations` update to include `skillProgress` relation
  - _Requirements: 6.2, 6.4, 6.5_

  - [x] 1.2 Generate and apply the Drizzle migration
  - Run `drizzle-kit generate` and `drizzle-kit push` to sync the schema
  - _Requirements: 6.2_

  - [ ]* 1.3 Write property test: Toggle round-trip (Property 7)
  - **Property 7: Skill toggle round-trip**
  - Using `fast-check`, generate random userId + skillId pairs. Insert a skill_progress record, then delete it, and verify no record exists. Insert again and verify exactly one record exists.
  - **Validates: Requirements 4.1, 4.2**

  - [ ]* 1.4 Write property test: User isolation (Property 6)
  - **Property 6: User isolation**
  - Generate two distinct user IDs and sets of skill toggle operations. Verify writes use the correct userId and reads return only records for the queried user.
  - **Validates: Requirements 3.7, 6.3**

- [x] 2. Implement tRPC progress router
  - [x] 2.1 Create `packages/api/src/routers/progress.ts` with `progressRouter`
  - Implement `toggleSkill` mutation (insert on complete, delete on incomplete, upsert semantics with ON CONFLICT)
  - Implement `getByRoadmap` query (accepts roadmapSlug, returns skill progress records filtered to skills in that roadmap)
  - Implement `getSummary` query (accepts roadmapSlug, returns completed/total counts per track + overall)
  - All endpoints use `protectedProcedure`; userId comes from `ctx.session.user.id`
  - _Requirements: 4.1, 4.2, 6.1, 6.3, 8.1, 8.2_

  - [x] 2.2 Wire `progressRouter` into `appRouter` in `packages/api/src/routers/index.ts`
  - Add `progress: progressRouter` to the existing `appRouter`
  - _Requirements: 6.1_

  - [ ]* 2.3 Write property test: Roadmap-scoped progress filtering (Property 11)
  - **Property 11: Roadmap-scoped progress filtering**
  - Generate progress records spanning multiple roadmaps. Query for a specific roadmap and verify only matching skill IDs are returned.
  - **Validates: Requirements 8.1**

  - [ ]* 2.4 Write unit tests for progress router
  - Test UNAUTHORIZED error for unauthenticated requests
  - Test NOT_FOUND for non-existent roadmap slugs
  - Test unique constraint behavior on duplicate toggles
  - _Requirements: 6.1, 8.4, 6.4_

- [x] 3. Checkpoint — Verify data layer and API
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Extend Fumadocs content schema with roadmap frontmatter
  - [x] 4.1 Update `apps/fumadocs/source.config.ts` to extend `pageSchema` with optional roadmap frontmatter fields
  - Add Zod schema for `roadmap`, `track`, `trackTitle`, `trackOrder`, `topicOrder` fields (all optional as a group)
  - Ensure invalid/missing frontmatter excludes the topic from roadmap views (build-time warning)
  - _Requirements: 1.1, 1.2, 1.5_

  - [x] 4.2 Create roadmap content collection or metadata directory
  - Add `content/roadmaps/` directory with MDX files for roadmap-level metadata (title, description)
  - Configure Fumadocs source loader to handle roadmap metadata files
  - _Requirements: 1.3, 7.1_

  - [x] 4.3 Create sample roadmap content for development/testing
  - Create at least one sample roadmap with 2 tracks, each with 2 topics containing `<Skill>` components
  - Place files in `apps/fumadocs/content/docs/` with proper frontmatter
  - _Requirements: 1.1, 1.2, 2.1_

  - [ ]* 4.4 Write property test: Frontmatter parsing round-trip (Property 1)
  - **Property 1: Frontmatter parsing round-trip**
  - Generate random valid frontmatter objects, serialize to YAML, parse back through Zod schema, verify equivalence.
  - **Validates: Requirements 1.1, 1.2**

  - [ ]* 4.5 Write property test: Invalid frontmatter exclusion (Property 3)
  - **Property 3: Invalid frontmatter exclusion**
  - Generate mixed sets of valid/invalid frontmatter. Run through the roadmap structure builder and verify only valid topics are included.
  - **Validates: Requirements 1.5**

- [x] 5. Build roadmap structure utilities
  - [x] 5.1 Create `apps/fumadocs/src/lib/roadmap.ts` with utility functions
  - Implement `getRoadmapStructure(roadmapSlug)` — filters source pages by roadmap frontmatter, groups by track, sorts by trackOrder/topicOrder, extracts skill IDs per topic
  - Implement `getAllRoadmaps()` — returns list of all roadmap metadata
  - Implement `getTopicNavigation(roadmapSlug, trackSlug, topicOrder)` — returns prev/next topic links within a track
  - _Requirements: 1.3, 7.1, 7.4_

  - [ ]* 5.2 Write property test: Track grouping and ordering (Property 2)
  - **Property 2: Track grouping and ordering**
  - Generate random topic sets with track metadata. Verify grouping correctness, track sort by trackOrder, topic sort by topicOrder.
  - **Validates: Requirements 1.3**

  - [ ]* 5.3 Write property test: Skill extraction completeness (Property 4)
  - **Property 4: Skill extraction completeness**
  - Generate topics with random skill ID sets. Verify extracted IDs match input IDs exactly.
  - **Validates: Requirements 2.2**

  - [ ]* 5.4 Write property test: Skill ID uniqueness detection (Property 5)
  - **Property 5: Skill ID uniqueness detection**
  - Generate skill ID sets with and without duplicates. Verify validator detects duplicates iff they exist.
  - **Validates: Requirements 2.5**

  - [ ]* 5.5 Write property test: Prev/next topic navigation (Property 10)
  - **Property 10: Prev/next topic navigation**
  - Generate ordered topic lists and random index. Verify correct adjacent topic links (null at boundaries).
  - **Validates: Requirements 7.4**

- [x] 6. Checkpoint — Verify content schema and utilities
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 7. Implement auth integration for Fumadocs app
  - [~] 7.1 Configure better-auth email OTP plugin in `packages/auth/src/index.ts`
  - Add `emailOTP` plugin to the better-auth config
  - Remove or disable `emailAndPassword` (OTP-only per requirements)
  - Configure username to default to email on account creation
  - _Requirements: 3.1, 3.2, 3.3_

  - [~] 7.2 Set up auth client in `apps/fumadocs`
  - Create `apps/fumadocs/src/lib/auth-client.ts` using better-auth client with email OTP plugin
  - Provide `useSession()` hook access for client components
  - _Requirements: 3.1, 3.7_

  - [~] 7.3 Create OTP sign-in UI components
  - Build email input → OTP input flow as client components
  - Integrate sign-in/sign-out controls into the Fumadocs layout header (update `apps/fumadocs/src/lib/layout.shared.tsx` or layout files)
  - _Requirements: 3.1, 3.2_

  - [~] 7.4 Create profile page for username update
  - Add `/profile` route in `apps/fumadocs` where authenticated students can update their username
  - _Requirements: 3.4_

  - [ ]* 7.5 Write unit tests for auth integration
  - Test that username defaults to email on first sign-in
  - Test that username can be updated via profile page
  - _Requirements: 3.3, 3.4_

- [ ] 8. Implement Skill and SkillToggle components
  - [~] 8.1 Create `<Skill>` RSC component in `apps/fumadocs/src/components/skill.tsx`
  - Async server component that queries DB for authenticated user's completion state via Drizzle
  - Passes `initialCompleted` and `isAuthenticated` to the client child component
  - _Requirements: 2.1, 2.3, 4.3_

  - [~] 8.2 Create `<SkillToggle>` client component in `apps/fumadocs/src/components/skill-toggle.client.tsx`
  - Renders checkbox with skill label
  - Optimistic UI toggle → tRPC `toggleSkill` mutation → revert on failure with error toast
  - Disabled state with sign-in prompt when not authenticated
  - _Requirements: 2.3, 3.5, 3.6, 4.4_

  - [~] 8.3 Register `<Skill>` in MDX components map
  - Add `Skill` to `getMDXComponents()` in `apps/fumadocs/src/components/mdx.tsx`
  - _Requirements: 2.1_

  - [~] 8.4 Set up tRPC client in `apps/fumadocs` for client-side mutations
  - Create tRPC client configuration for the Fumadocs Next.js app to call the backend API
  - Wire up React Query provider for tRPC in the app layout
  - _Requirements: 4.1, 4.2_

  - [ ]* 8.5 Write property test: Progress state mapping — SSR (Property 8)
  - **Property 8: Progress state mapping (SSR)**
  - Generate skill ID sets and completed subsets. Verify the server-side state resolution produces correct boolean for each skill.
  - **Validates: Requirements 4.3**

  - [ ]* 8.6 Write unit tests for SkillToggle client behavior
  - Test optimistic toggle and revert on failure
  - Test disabled state when not authenticated
  - Test sign-in prompt on interaction when not authenticated
  - _Requirements: 4.4, 3.5, 3.6_

- [ ] 9. Implement ProgressBar components
  - [~] 9.1 Create `<ProgressBar>` RSC component in `apps/fumadocs/src/components/progress-bar.tsx`
  - Async server component that queries DB for completed skill count within given skillIds
  - Passes completed/total/isAuthenticated to client child
  - _Requirements: 5.1, 5.2, 5.3_

  - [~] 9.2 Create `<ProgressBarClient>` client component in `apps/fumadocs/src/components/progress-bar.client.tsx`
  - Renders horizontal progress bar with percentage
  - Shows 0% with "Sign in to track progress" when not authenticated
  - Supports refresh after skill toggle via `router.refresh()` or tRPC re-fetch
  - _Requirements: 5.4, 5.5_

  - [ ]* 9.3 Write property test: Progress ratio computation (Property 9)
  - **Property 9: Progress ratio computation**
  - Generate roadmap structures with skill IDs and completed subsets. Verify topic/track/roadmap ratios are correct and in [0, 1].
  - **Validates: Requirements 5.1, 5.2, 5.3, 8.2**

- [~] 10. Checkpoint — Verify components
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 11. Build Roadmap pages and navigation
  - [~] 11.1 Create Roadmap index page
  - Add `/roadmaps` route in `apps/fumadocs` listing all roadmaps with name, description, and link to each roadmap view
  - Use `getAllRoadmaps()` utility from step 5.1
  - _Requirements: 7.1, 7.2_

  - [~] 11.2 Create Roadmap view page
  - Add `/roadmaps/[slug]` route displaying all tracks within a roadmap
  - Show track names, topic lists, and track-level `<ProgressBar>` components
  - Show overall roadmap `<ProgressBar>` at the top
  - Use `getRoadmapStructure()` utility from step 5.1
  - _Requirements: 1.3, 1.4, 5.2, 5.3, 7.2, 7.3_

  - [~] 11.3 Add topic-level progress bar and prev/next navigation to topic pages
  - Update the docs page layout or create a wrapper for roadmap topic pages
  - Add `<ProgressBar>` for the current topic's skills
  - Add prev/next topic navigation links using `getTopicNavigation()` from step 5.1
  - _Requirements: 5.1, 7.4_

  - [~] 11.4 Integrate roadmap entries into Fumadocs sidebar
  - Add roadmap navigation entries to the Fumadocs sidebar configuration alongside existing docs pages
  - _Requirements: 7.5_

  - [ ]* 11.5 Write unit tests for roadmap pages
  - Test roadmap index renders names and descriptions
  - Test roadmap view renders tracks and topics
  - Test navigation links point to correct pages
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 12. Build-time validation for skill IDs and frontmatter
  - [~] 12.1 Implement build-time validation in the Fumadocs MDX pipeline
  - Validate that all `<Skill>` components have `id` and `label` props (block build on missing)
  - Validate skill ID uniqueness within each roadmap (block build on duplicates)
  - Log warnings for invalid/missing roadmap frontmatter
  - Hook into `source.config.ts` or a custom build plugin
  - _Requirements: 1.5, 2.4, 2.5_

  - [ ]* 12.2 Write unit tests for build-time validation
  - Test that missing id/label on Skill blocks the build
  - Test that duplicate skill IDs block the build
  - Test that invalid frontmatter logs a warning but doesn't block
  - _Requirements: 1.5, 2.4, 2.5_

- [ ] 13. Wire getSummary and getByRoadmap to use content structure
  - [~] 13.1 Update `getSummary` and `getByRoadmap` tRPC endpoints to resolve roadmap skill IDs from content
  - Import or call the roadmap structure utilities to determine which skill IDs belong to a given roadmap
  - Validate roadmap slug exists, return NOT_FOUND if not
  - Filter progress records to only skills within the requested roadmap
  - _Requirements: 8.1, 8.2, 8.4_

  - [ ]* 13.2 Write integration tests for progress API with content structure
  - Test that getByRoadmap returns only skills belonging to the specified roadmap
  - Test that getSummary returns correct per-track counts
  - Test NOT_FOUND for invalid roadmap slug
  - _Requirements: 8.1, 8.2, 8.4_

- [~] 14. Final checkpoint — End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The hybrid RSC approach means initial page loads fetch progress server-side; tRPC is used for mutations and client-side refresh
