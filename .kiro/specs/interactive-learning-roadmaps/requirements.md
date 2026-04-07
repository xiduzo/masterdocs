# Requirements Document

## Introduction

This feature transforms the existing Fumadocs-based documentation site into an interactive learning platform. Content is organized into structured learning roadmaps composed of tracks, topics, and skills. Students authenticate, mark skills as complete inline within content pages, and track their progress visually. Teachers author content as MDX with embedded skill markers. The system persists progress in the existing PostgreSQL database and exposes it via the existing tRPC API layer.

## Glossary

- **Learning_Platform**: The overall interactive learning system built on top of the Fumadocs application (`apps/fumadocs`) and the backend server (`apps/server`).
- **Roadmap**: A top-level learning path that groups related Tracks into a structured curriculum (e.g., "Frontend Development").
- **Track**: A sequence of Topics within a Roadmap representing a major subject area (e.g., "JavaScript Fundamentals").
- **Topic**: A single content page (MDX document) within a Track, containing explanatory content and embedded Skill markers.
- **Skill**: An atomic, completable learning objective embedded within a Topic. Each Skill has a unique identifier and a human-readable label.
- **Skill_Checkbox**: A React component rendered inline in MDX content that allows a Student to mark a Skill as complete or incomplete.
- **Progress_Record**: A database entry linking a Student to a Skill, storing completion status and timestamp.
- **Progress_Bar**: A React component that displays the percentage of completed Skills within a given Topic, Track, or Roadmap.
- **Student**: An authenticated user of the Learning_Platform who reads content and tracks Skill completion.
- **Teacher**: A content author who creates and edits MDX content containing Skill markers and Roadmap structure.
- **Roadmap_View**: A visual overview page displaying all Tracks within a Roadmap and the Student's aggregated completion status.
- **API_Server**: The existing Hono-based backend (`apps/server`) exposing tRPC endpoints for progress data.
- **Auth_System**: The existing better-auth authentication system used to identify Students.
- **Content_Source**: The Fumadocs MDX content pipeline that processes Markdown/MDX files from the `content/docs` directory.

## Requirements

### Requirement 1: Roadmap and Track Structure

**User Story:** As a Teacher, I want to organize content into Roadmaps, Tracks, and Topics, so that Students can follow a structured learning path.

#### Acceptance Criteria

1. THE Content_Source SHALL support a `roadmap` frontmatter field in MDX files that assigns a Topic to a specific Roadmap and Track.
2. WHEN a Topic MDX file includes a `roadmap` frontmatter field, THE Content_Source SHALL parse the Roadmap name, Track name, and display order from the frontmatter.
3. THE Learning_Platform SHALL display a Roadmap_View page listing all Tracks within a Roadmap, grouped and ordered by Track sequence.
4. WHEN a Student navigates to a Roadmap_View, THE Learning_Platform SHALL display each Track with its name, description, and the list of Topics within the Track.
5. IF a Topic MDX file contains an invalid or missing `roadmap` frontmatter value, THEN THE Content_Source SHALL exclude the Topic from all Roadmap_Views and log a warning during the build process.

### Requirement 2: Skill Definition in Content

**User Story:** As a Teacher, I want to embed skill markers directly in MDX content, so that Students can see exactly what they should learn from each section.

#### Acceptance Criteria

1. THE Content_Source SHALL support a `<Skill>` MDX component that accepts an `id` (unique string) and `label` (human-readable string) as required props.
2. WHEN a Topic MDX file contains one or more `<Skill>` components, THE Content_Source SHALL extract all Skill identifiers and register them as belonging to that Topic.
3. THE Learning_Platform SHALL render each `<Skill>` component as a Skill_Checkbox displaying the Skill label and a toggleable completion indicator.
4. IF a `<Skill>` component is missing the `id` or `label` prop, THEN THE Content_Source SHALL report a validation error during the build process identifying the file and component location.
5. THE Learning_Platform SHALL enforce uniqueness of Skill `id` values across all Topics within a Roadmap, and THE Content_Source SHALL report a validation error during the build process when duplicate Skill identifiers are detected.

### Requirement 3: Student Authentication

**User Story:** As a Student, I want to sign in to the Learning_Platform using a one-time password sent to my email, so that my progress is saved to my account without needing to remember a password.

#### Acceptance Criteria

1. THE Learning_Platform SHALL integrate with the Auth_System to allow Students to sign in using email OTP (one-time password) only. No password-based registration or login SHALL be supported.
2. WHEN a Student signs in with an email address for the first time, THE Auth_System SHALL automatically create a new account for that Student. There SHALL be no separate registration step.
3. WHEN a new account is created via first-time OTP sign-in, THE Auth_System SHALL set the Student's username to the same value as their email address.
4. THE Learning_Platform SHALL provide a profile page where an authenticated Student can update their username.
5. WHEN a Student is not authenticated, THE Learning_Platform SHALL display Skill_Checkboxes in a disabled, read-only state.
6. WHEN a Student is not authenticated and interacts with a Skill_Checkbox, THE Learning_Platform SHALL display a prompt directing the Student to sign in.
7. WHILE a Student is authenticated, THE Learning_Platform SHALL associate all progress actions with the Student's user identity from the Auth_System.

### Requirement 4: Skill Completion Tracking

**User Story:** As a Student, I want to mark skills as complete while reading content, so that I can track what I have learned.

#### Acceptance Criteria

1. WHEN an authenticated Student toggles a Skill_Checkbox to complete, THE API_Server SHALL create a Progress_Record linking the Student's user ID, the Skill ID, and the completion timestamp.
2. WHEN an authenticated Student toggles a Skill_Checkbox to incomplete, THE API_Server SHALL remove the corresponding Progress_Record for that Student and Skill.
3. WHEN a Topic page loads for an authenticated Student, THE Learning_Platform SHALL fetch the Student's Progress_Records for all Skills in that Topic and render each Skill_Checkbox in the correct completion state.
4. IF the API_Server is unreachable when a Student toggles a Skill_Checkbox, THEN THE Learning_Platform SHALL display an error notification and revert the Skill_Checkbox to its previous state.
5. THE API_Server SHALL complete a Skill completion toggle request within 500 milliseconds under normal operating conditions.

### Requirement 5: Progress Visualization

**User Story:** As a Student, I want to see my progress at the Topic, Track, and Roadmap level, so that I can understand how far I have come and what remains.

#### Acceptance Criteria

1. WHEN a Topic page loads for an authenticated Student, THE Learning_Platform SHALL display a Progress_Bar showing the ratio of completed Skills to total Skills in that Topic.
2. WHEN a Student views the Roadmap_View, THE Learning_Platform SHALL display a Progress_Bar for each Track showing the ratio of completed Skills to total Skills across all Topics in that Track.
3. WHEN a Student views the Roadmap_View, THE Learning_Platform SHALL display an overall Progress_Bar showing the ratio of completed Skills to total Skills across the entire Roadmap.
4. WHEN a Student completes or uncompletes a Skill, THE Learning_Platform SHALL update all visible Progress_Bars within 2 seconds without requiring a full page reload.
5. WHILE a Student is not authenticated, THE Learning_Platform SHALL display Progress_Bars at zero percent with a label indicating that sign-in is required to track progress.

### Requirement 6: Progress Data Persistence

**User Story:** As a Student, I want my progress to be saved reliably, so that I can resume learning across sessions and devices.

#### Acceptance Criteria

1. THE API_Server SHALL expose tRPC endpoints for creating, deleting, and querying Progress_Records, accessible only to authenticated Students via the existing protectedProcedure middleware.
2. THE API_Server SHALL store Progress_Records in the PostgreSQL database using a Drizzle ORM schema within the existing `packages/db` package.
3. WHEN an authenticated Student queries progress, THE API_Server SHALL return only Progress_Records belonging to that Student.
4. THE Progress_Record database schema SHALL enforce a unique constraint on the combination of Student user ID and Skill ID to prevent duplicate entries.
5. WHEN a Student's account is deleted from the Auth_System, THE database SHALL cascade-delete all Progress_Records associated with that Student.

### Requirement 7: Roadmap Navigation and Discovery

**User Story:** As a Student, I want to browse available Roadmaps and navigate between Tracks and Topics, so that I can choose what to learn.

#### Acceptance Criteria

1. THE Learning_Platform SHALL provide a Roadmap index page listing all available Roadmaps with their names and descriptions.
2. WHEN a Student selects a Roadmap from the index page, THE Learning_Platform SHALL navigate to the Roadmap_View for that Roadmap.
3. WHEN a Student selects a Topic from the Roadmap_View, THE Learning_Platform SHALL navigate to the Topic content page within the Fumadocs documentation layout.
4. WHEN a Student is viewing a Topic page, THE Learning_Platform SHALL display navigation links to the previous and next Topics within the same Track.
5. THE Learning_Platform SHALL include Roadmap navigation entries in the Fumadocs sidebar alongside existing documentation pages.

### Requirement 8: Progress API Query Support

**User Story:** As a developer, I want to query progress data efficiently, so that the frontend can render progress indicators without excessive loading times.

#### Acceptance Criteria

1. THE API_Server SHALL provide a tRPC endpoint that returns all Progress_Records for an authenticated Student within a specified Roadmap in a single request.
2. THE API_Server SHALL provide a tRPC endpoint that returns a summary of completed Skill counts grouped by Track for a specified Roadmap and authenticated Student.
3. WHEN the summary endpoint is called, THE API_Server SHALL return the response within 300 milliseconds for Roadmaps containing up to 500 Skills.
4. THE API_Server SHALL validate that the Roadmap identifier provided in query requests corresponds to an existing Roadmap, and IF the Roadmap does not exist, THEN THE API_Server SHALL return a descriptive error with a NOT_FOUND error code.
