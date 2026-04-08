# Product Overview

fumadocs-learning is an interactive learning platform for technical topics (currently Arduino and Figma). It combines structured documentation with skill-tracking roadmaps so learners can follow guided paths and track their progress.

## Core Concepts

- **Roadmaps**: Curated learning paths (e.g. Arduino, Figma) composed of ordered tracks and topics
- **Tracks**: Grouped sections within a roadmap (e.g. "Sensors and Input", "Components and Variants")
- **Topics**: Individual documentation pages within a track, containing learnable skills
- **Skills**: Granular checkpoints within a topic that users mark as complete. Defined via `<Skill id="..." />` components in MDX content
- **Progress**: Per-user skill completion state, persisted server-side and synced across web, mobile, and docs apps

## Applications

- **Docs site** (`apps/fumadocs`): Next.js-based documentation and roadmap viewer powered by Fumadocs. Serves MDX content, roadmap pages, and progress tracking UI
- **Web app** (`apps/web`): Vite + TanStack Router SPA with auth, user profile, and PWA support
- **Mobile app** (`apps/native`): React Native / Expo app with the same auth and progress features
- **API server** (`apps/server`): Hono HTTP server exposing tRPC endpoints and Better Auth routes
