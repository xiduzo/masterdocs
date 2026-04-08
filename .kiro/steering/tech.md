# Tech Stack

## Runtime & Package Manager
- **Bun** (v1.3.10) — runtime and package manager (`bun install`, not npm/yarn)
- **TypeScript** — strict mode, ESNext target, bundler module resolution
- All packages use `"type": "module"` (ESM only)

## Build System
- **Turborepo** — monorepo orchestration. Task config in `turbo.json`
- Workspace packages: `apps/*` and `packages/*`
- Bun catalog for shared dependency versions in root `package.json`

## Server (`apps/server`)
- **Hono** — HTTP framework
- **tRPC** (v11) — type-safe API layer, routers live in `packages/api/src/routers/`
- **Better Auth** — authentication (email/password, session-based)
- **tsdown** — production build bundler
- Dev: `bun run --hot src/index.ts`

## Web App (`apps/web`)
- **React 19** + **Vite**
- **TanStack Router** — file-based routing with full type safety
- **TanStack React Query** — server state / tRPC integration
- **TailwindCSS v4** (via `@tailwindcss/vite` plugin)
- **shadcn/ui** (base-lyra style) — shared primitives from `packages/ui`
- **PWA** via `vite-plugin-pwa`
- Path alias: `@` → `apps/web/src`

## Docs Site (`apps/fumadocs`)
- **Next.js 16** (App Router)
- **Fumadocs** (fumadocs-core + fumadocs-mdx + fumadocs-ui) — MDX-powered docs framework
- Content in `apps/fumadocs/content/docs/` (MDX with extended frontmatter for roadmap metadata)
- Roadmap metadata in `apps/fumadocs/content/roadmaps/`
- **Zustand** for client-side progress state
- Runs on port 4000 in dev

## Mobile App (`apps/native`)
- **React Native 0.83** + **Expo 55** (Expo Router, file-based routing)
- **NativeWind / uniwind** — TailwindCSS for React Native
- **HeroUI Native** — component library
- Drawer + tab navigation layout

## Database
- **PostgreSQL** (via Docker Compose in `packages/db/`)
- **Drizzle ORM** — schema in `packages/db/src/schema/`, migrations in `packages/db/src/migrations/`
- Drizzle Kit for push/generate/migrate/studio

## Environment Variables
- Validated with `@t3-oss/env-core` + Zod in `packages/env/`
- Server env loaded from `apps/server/.env`
- Web env prefixed `VITE_`, native env prefixed `EXPO_PUBLIC_`

## Common Commands

```bash
# Install dependencies
bun install

# Development (all apps)
bun run dev

# Development (individual apps)
bun run dev:web        # Web app on :3001
bun run dev:server     # API server on :3000
bun run dev:native     # Expo dev server

# Build
bun run build

# Type checking
bun run check-types

# Database
bun run db:start       # Start PostgreSQL via Docker
bun run db:push        # Push schema to database
bun run db:generate    # Generate migration files
bun run db:migrate     # Run migrations
bun run db:studio      # Open Drizzle Studio
bun run db:stop        # Stop Docker container
bun run db:down        # Remove Docker container

# Add shared UI components
npx shadcn@latest add <component> -c packages/ui
```
