# Requirements Document

## Introduction

A lightweight MDX content editor in the web app (`apps/web`) that allows authenticated administrators to create and edit the MDX documentation files powering the fumadocs learning platform. The editor provides a structured editing experience with frontmatter management, Markdown body editing with live preview, and support for inserting custom MDX components (`<Skill>`, `<YouTube>`).

Under the hood, all content operations are backed by GitHub. Content is fetched from the repository's main branch via the GitHub API, edits create feature branches and pull requests, and publishing merges the PR back to main. The Git mechanics are completely invisible to the end user — they interact with simple content states (draft, pending review, published) rather than branches and PRs.

This is intentionally scoped as a practical content management tool — not a full CMS or drag-and-drop page builder. The goal is to make it easy for content authors to populate and maintain roadmap documentation without hand-editing raw MDX files or understanding Git workflows.

## Glossary

- **Content_API**: A tRPC router (`packages/api/src/routers/content.ts`) that provides GitHub-backed CRUD operations for MDX content files
- **GitHub_Service**: A server-side service that wraps the GitHub API (via Octokit) to perform repository operations (read files, create branches, commit, create PRs, merge)
- **Editor_Page**: The route and UI in `apps/web` where administrators edit MDX content
- **Frontmatter_Form**: A structured form for editing MDX frontmatter fields (title, description, roadmap metadata)
- **Body_Editor**: A rich-text / Markdown editor component for editing the MDX body content below the frontmatter
- **Preview_Panel**: A panel that renders a live preview of the Markdown body content
- **Component_Inserter**: UI controls for inserting custom MDX components (`<Skill>`, `<YouTube>`) into the body
- **Content_Path**: The path prefix `apps/fumadocs/content/docs/` within the GitHub repository where MDX topic files are stored
- **Roadmap_Path**: The path prefix `apps/fumadocs/content/roadmaps/` within the GitHub repository where roadmap metadata files are stored
- **Admin_User**: An authenticated user with the `admin` role, authorized to create and edit content
- **MDX_File**: A Markdown/MDX file with YAML frontmatter and a body containing Markdown and JSX components
- **Content_State**: The lifecycle state of a content change: `draft` (local unsaved edits), `pending_review` (branch + PR created), or `published` (PR merged to main)
- **Change_Record**: A database record tracking a pending content change, linking the Admin_User, file path, branch name, and PR number

## Requirements

### Requirement 1: Admin Role and Authorization

**User Story:** As a platform owner, I want only designated administrators to access the content editor, so that content integrity is maintained.

#### Acceptance Criteria

1. THE Auth_Configuration SHALL support an `admin` role on user accounts via a `role` field on the Better Auth user schema
2. WHEN an unauthenticated user navigates to the Editor_Page, THE Web_App SHALL redirect the user to the login page
3. WHEN an authenticated non-admin user navigates to the Editor_Page, THE Web_App SHALL display an "access denied" message and prevent access to editor functionality
4. WHEN an unauthenticated or non-admin user calls a Content_API procedure, THE Content_API SHALL return an authorization error
5. THE Content_API SHALL use a dedicated `adminProcedure` that verifies the calling user has the `admin` role before executing any content mutation or query

### Requirement 2: GitHub Integration Configuration

**User Story:** As a developer, I want the GitHub connection to be configured via environment variables, so that the content editor can securely access the repository.

#### Acceptance Criteria

1. THE Server_Environment SHALL require the following environment variables: `GITHUB_TOKEN` (personal access token or GitHub App token with repo scope), `GITHUB_OWNER` (repository owner), and `GITHUB_REPO` (repository name)
2. THE Environment_Validation (`packages/env/src/server.ts`) SHALL validate that `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` are non-empty strings when present
3. THE GitHub_Service SHALL authenticate all GitHub API requests using the configured `GITHUB_TOKEN`
4. THE GitHub_Service SHALL target the repository identified by `GITHUB_OWNER` and `GITHUB_REPO` for all operations
5. IF the GitHub API returns an authentication error, THEN THE GitHub_Service SHALL return a descriptive error indicating invalid or expired credentials

### Requirement 3: Content Listing and Navigation

**User Story:** As an admin, I want to browse all existing MDX content organized by roadmap, so that I can find and select files to edit.

#### Acceptance Criteria

1. WHEN an Admin_User opens the Editor_Page, THE Editor_Page SHALL display a sidebar listing all roadmap directories and their topic files fetched from the Content_Path on the main branch
2. THE Content_API SHALL provide a `list` query that uses the GitHub_Service to read the directory tree of MDX files from the main branch, grouped by roadmap folder, including each file's frontmatter title and slug
3. WHEN an Admin_User selects a file from the sidebar, THE Editor_Page SHALL load that file's frontmatter and body into the editing interface
4. THE sidebar SHALL display roadmap directories as collapsible groups with topic files listed underneath
5. WHEN a file has a pending Change_Record (Content_State is `pending_review`), THE sidebar SHALL display a visual indicator next to that file

### Requirement 4: Frontmatter Editing

**User Story:** As an admin, I want to edit MDX frontmatter fields through a structured form, so that I can set titles, descriptions, and roadmap metadata without manually editing YAML.

#### Acceptance Criteria

1. WHEN a file is loaded for editing, THE Frontmatter_Form SHALL display form fields for: `title` (text input), `description` (text area), `roadmap` (text input), `track` (text input), `trackTitle` (text input), `trackOrder` (number input), and `topicOrder` (number input)
2. THE Frontmatter_Form SHALL pre-populate all fields with the current values from the loaded MDX file's frontmatter
3. WHEN an Admin_User modifies a frontmatter field, THE Frontmatter_Form SHALL validate that `title` is non-empty
4. THE Frontmatter_Form SHALL treat roadmap metadata fields (`roadmap`, `track`, `trackTitle`, `trackOrder`, `topicOrder`) as optional, allowing them to be left blank for non-roadmap pages

### Requirement 5: Body Content Editing

**User Story:** As an admin, I want to edit the MDX body content with a Markdown-aware editor, so that I can write and format documentation content efficiently.

#### Acceptance Criteria

1. WHEN a file is loaded for editing, THE Body_Editor SHALL display the MDX body content (everything below the frontmatter) in a code editor with Markdown syntax highlighting
2. THE Body_Editor SHALL provide a toolbar with buttons for common Markdown formatting: headings (H2, H3), bold, italic, links, unordered lists, and code blocks
3. WHEN an Admin_User clicks a toolbar formatting button, THE Body_Editor SHALL insert the corresponding Markdown syntax at the current cursor position or wrap the selected text
4. THE Body_Editor SHALL preserve all existing MDX component syntax (`<Skill>`, `<YouTube>`, and any other JSX) without modification during editing

### Requirement 6: Custom Component Insertion

**User Story:** As an admin, I want to insert `<Skill>` and `<YouTube>` components through a guided UI, so that I don't need to remember the exact JSX syntax.

#### Acceptance Criteria

1. THE Component_Inserter SHALL provide an "Insert Skill" button that opens a form with fields for `id` (required text) and `label` (required text)
2. WHEN an Admin_User submits the Skill insertion form, THE Component_Inserter SHALL insert `<Skill id="[provided_id]" label="[provided_label]" />` at the current cursor position in the Body_Editor
3. THE Component_Inserter SHALL provide an "Insert YouTube" button that opens a form with a field for `id` (required text, the YouTube video ID)
4. WHEN an Admin_User submits the YouTube insertion form, THE Component_Inserter SHALL insert `<YouTube id="[provided_id]" />` at the current cursor position in the Body_Editor
5. THE Component_Inserter SHALL validate that all required fields are non-empty before inserting a component

### Requirement 7: Live Preview

**User Story:** As an admin, I want to see a rendered preview of the Markdown content as I edit, so that I can verify formatting before saving.

#### Acceptance Criteria

1. THE Preview_Panel SHALL render the body content as formatted HTML, converting standard Markdown syntax (headings, bold, italic, links, lists, code blocks) to their visual equivalents
2. WHEN the Admin_User modifies content in the Body_Editor, THE Preview_Panel SHALL update the rendered preview within 300 milliseconds of the user pausing input
3. THE Preview_Panel SHALL display `<Skill>` components as a styled placeholder showing the skill label text
4. THE Preview_Panel SHALL display `<YouTube>` components as a styled placeholder showing the video ID
5. THE Editor_Page SHALL allow the Admin_User to toggle the Preview_Panel visibility on and off

### Requirement 8: Submitting Changes

**User Story:** As an admin, I want to submit my content edits for review, so that changes go through a controlled review process before going live.

#### Acceptance Criteria

1. WHEN an Admin_User clicks the "Submit" button, THE Content_API SHALL create a new branch from the current main branch HEAD using the GitHub_Service
2. THE Content_API SHALL use a branch naming convention of `content/<file-slug>-<timestamp>` for the new branch
3. THE Content_API SHALL commit the serialized MDX file (frontmatter + body) to the new branch at the correct path within the Content_Path
4. THE Content_API SHALL create a pull request from the new branch to main using the GitHub_Service, with the PR title set to "Content update: [file title]" and a body describing the changed file
5. WHEN the branch, commit, and PR are created successfully, THE Content_API SHALL store a Change_Record in the database linking the Admin_User, file path, branch name, and PR number
6. WHEN the submission succeeds, THE Editor_Page SHALL display a success notification and update the file's Content_State to `pending_review`
7. THE Content_API `submit` mutation SHALL validate that the frontmatter `title` field is non-empty before creating the branch and PR
8. IF the GitHub API returns an error during branch creation, commit, or PR creation, THEN THE Content_API SHALL return a descriptive error and THE Editor_Page SHALL display the error to the Admin_User

### Requirement 9: Creating New Content Files

**User Story:** As an admin, I want to create new MDX topic files within a roadmap directory, so that I can add new documentation pages.

#### Acceptance Criteria

1. THE Editor_Page SHALL provide a "New File" action that prompts the Admin_User for a roadmap directory (selected from existing directories or entered as a new name) and a file slug
2. THE Content_API `create` mutation SHALL validate that the file slug contains only lowercase letters, numbers, and hyphens
3. IF a file with the same slug already exists at the target path on the main branch, THEN THE Content_API `create` mutation SHALL return an error indicating the file already exists
4. WHEN a new file is created, THE Content_API SHALL follow the same branch + PR workflow as Requirement 8: create a branch, commit the new MDX file with default frontmatter (title derived from slug) and an empty body, and open a PR
5. WHEN a new file is created successfully, THE Editor_Page SHALL load the new file into the editing interface with Content_State set to `pending_review`

### Requirement 10: Publishing Content

**User Story:** As an admin, I want to publish submitted content changes, so that edits go live on the documentation site.

#### Acceptance Criteria

1. WHEN an Admin_User clicks the "Publish" button on a file with Content_State `pending_review`, THE Content_API SHALL merge the associated pull request into main using the GitHub_Service
2. THE Content_API `publish` mutation SHALL use a merge commit strategy when merging the PR
3. WHEN the merge succeeds, THE Content_API SHALL update the Change_Record status to `published` and delete the feature branch using the GitHub_Service
4. WHEN the publish succeeds, THE Editor_Page SHALL display a success notification and update the file's Content_State to `published`
5. IF the merge fails due to a merge conflict, THEN THE Content_API SHALL return a conflict error and THE Editor_Page SHALL display the conflict resolution UI (see Requirement 12)
6. THE Editor_Page SHALL display the "Publish" button only for files with Content_State `pending_review`

### Requirement 11: Pending Changes Management

**User Story:** As an admin, I want to see all pending content changes and their statuses, so that I can track what is awaiting review or publishing.

#### Acceptance Criteria

1. THE Editor_Page SHALL provide a "Pending Changes" view that lists all Change_Records with Content_State `pending_review`
2. THE pending changes list SHALL display for each entry: the file path, the Admin_User who submitted the change, the submission timestamp, and the PR number
3. WHEN an Admin_User selects a pending change, THE Editor_Page SHALL load the file content from the feature branch (not main) into the editing interface
4. THE Editor_Page SHALL allow an Admin_User to discard a pending change, which closes the PR and deletes the branch via the GitHub_Service, and removes the Change_Record

### Requirement 12: Conflict Detection and Resolution

**User Story:** As an admin, I want to be notified when my edits conflict with changes on main, so that I can resolve conflicts before publishing.

#### Acceptance Criteria

1. WHEN an Admin_User opens a file for editing, THE Content_API SHALL compare the main branch HEAD with the base commit of any existing Change_Record for that file to detect if main has advanced
2. IF main has advanced since the Change_Record was created and the same file was modified on main, THEN THE Editor_Page SHALL display a "stale content" warning to the Admin_User
3. WHEN a merge conflict is detected during publishing (Requirement 10), THE Editor_Page SHALL display a conflict resolution UI showing the current main version and the submitted version side by side
4. THE conflict resolution UI SHALL allow the Admin_User to choose one of: "Keep my changes" (force-push rebased content onto the branch), "Use latest from main" (discard the PR and reload from main), or "Edit manually" (load both versions into the Body_Editor for manual merging)
5. WHEN the Admin_User selects "Keep my changes", THE Content_API SHALL fetch the latest main content, rebase the change by replacing the file on the feature branch with the Admin_User's version, and force-push the updated branch
6. WHEN the Admin_User selects "Use latest from main", THE Content_API SHALL close the PR, delete the branch, remove the Change_Record, and reload the file from main into the editor
7. WHEN the Admin_User selects "Edit manually", THE Editor_Page SHALL display the main version and the submitted version in adjacent panels, allowing the Admin_User to produce a merged result and re-submit

### Requirement 13: Content API GitHub Operations

**User Story:** As a developer, I want a tRPC router backed by the GitHub API, so that the editor has a reliable backend that manages content through Git workflows.

#### Acceptance Criteria

1. THE Content_API SHALL provide a `list` query that uses the GitHub_Service to read the Content_Path directory tree from the main branch and return roadmap folders and their MDX files with frontmatter metadata
2. THE Content_API SHALL provide a `get` query that accepts a roadmap slug and file slug, reads the corresponding MDX file from the main branch (or from a feature branch if a Change_Record exists and the `fromBranch` flag is set), and returns the parsed frontmatter, raw body content, and current Content_State
3. THE Content_API SHALL provide a `submit` mutation that creates a branch, commits the MDX file, creates a PR, and stores a Change_Record
4. THE Content_API SHALL provide a `create` mutation that validates the slug, creates a branch, commits a new MDX file with default content, creates a PR, and stores a Change_Record
5. THE Content_API SHALL provide a `publish` mutation that merges the PR, updates the Change_Record, and deletes the feature branch
6. THE Content_API SHALL provide a `discard` mutation that closes the PR, deletes the branch, and removes the Change_Record
7. THE Content_API SHALL provide a `checkConflict` query that compares the main branch HEAD against a Change_Record's base commit to determine if the file has diverged
8. IF a `get` query references a file that does not exist on the target branch, THEN THE Content_API SHALL return a "not found" error

### Requirement 14: MDX Serialization Round-Trip

**User Story:** As a developer, I want the MDX parsing and serialization to be lossless, so that loading and saving a file without edits produces an identical file.

#### Acceptance Criteria

1. THE Content_API SHALL parse MDX files by splitting on the YAML frontmatter delimiters (`---`) to extract frontmatter and body
2. THE Content_API SHALL serialize MDX files by combining YAML-formatted frontmatter between `---` delimiters with the body content, separated by a single blank line
3. FOR ALL valid MDX files in the Content_Path, parsing then serializing without modification SHALL produce output identical to the original file content (round-trip property)
4. THE Content_API SHALL serialize the MDX content before committing to the GitHub branch, ensuring the committed file is a valid MDX file
