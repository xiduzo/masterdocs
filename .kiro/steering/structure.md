# Project Structure

Turborepo monorepo with four apps and six shared packages. All workspace references use `workspace:*`.

```
fumadocs-learning/
├── apps/
│   ├── fumadocs/              # Docs site (Next.js + Fumadocs)
│   │   ├── content/
│   │   │   ├── docs/          # MDX documentation pages, organized by roadmap topic
│   │   │   │   ├── arduino/   # Arduino roadmap topics
│   │   │   │   └── figma/     # Figma roadmap topics
│   │   │   └── roadmaps/     # Roadmap metadata MDX files (title, description)
│   │   └── src/
│   │       ├── app/           # Next.js App Router pages
│   │       ├── components/    # Fumadocs-specific React components
│   │       └── lib/           # Utilities (roadmap logic, progress store, tRPC client)
│   │
│   ├── web/                   # Web SPA (Vite + TanStack Router)
│   │   └── src/
│   │       ├── components/    # App-specific components (header, auth forms, etc.)
│   │       ├── lib/           # Utilities and tRPC client setup
│   │       └── routes/        # TanStack Router file-based routes
│   │
│   ├── native/                # Mobile app (Expo Router)
│   │   ├── app/               # Expo Router file-based routes (drawer + tabs layout)
│   │   ├── components/        # Native-specific components
│   │   ├── contexts/          # React context providers
│   │   ├── lib/               # Utilities and tRPC client setup
│   │   └── utils/             # Helper functions
│   │
│   └── server/                # API server (Hono)
│       └── src/
│           └── index.ts       # Server entry — mounts tRPC + Better Auth on Hono
│
├── packages/
│   ├── api/                   # Shared tRPC router definitions and business logic
│   │   └── src/
│   │       ├── routers/       # tRPC routers (index.ts, progress.ts)
│   │       ├── lib/           # Shared helpers (roadmap content parsing)
│   │       └── context.ts     # tRPC context creation
│   │
│   ├── auth/                  # Better Auth configuration
│   │   └── src/
│   │       └── index.ts       # createAuth() factory
│   │
│   ├── config/                # Shared TypeScript config (tsconfig.base.json)
│   │
│   ├── db/                    # Database layer (Drizzle + PostgreSQL)
│   │   ├── src/
│   │   │   ├── schema/        # Drizzle table definitions (auth.ts, skill-progress.ts)
│   │   │   ├── migrations/    # Generated SQL migrations
│   │   │   └── index.ts       # createDb() factory
│   │   ├── drizzle.config.ts  # Drizzle Kit config (reads env from apps/server/.env)
│   │   └── docker-compose.yml # Local PostgreSQL container
│   │
│   ├── env/                   # Environment variable validation (@t3-oss/env-core)
│   │   └── src/
│   │       ├── server.ts      # Server env (DATABASE_URL, BETTER_AUTH_SECRET, etc.)
│   │       ├── web.ts         # Web env (VITE_SERVER_URL)
│   │       └── native.ts      # Native env (EXPO_PUBLIC_SERVER_URL)
│   │
│   └── ui/                    # Shared UI primitives (shadcn/ui)
│       └── src/
│           ├── components/    # Button, Card, Checkbox, Input, etc.
│           ├── hooks/         # Shared React hooks
│           ├── lib/           # utils.ts (cn helper)
│           └── styles/        # globals.css (design tokens, Tailwind base)
│
├── turbo.json                 # Turborepo task pipeline config
├── package.json               # Root workspace config with bun catalog
└── tsconfig.json              # Extends @fumadocs-learning/config/tsconfig.base.json
```

## Key Patterns

- **Package imports**: Use `@fumadocs-learning/<package>` namespace (e.g. `@fumadocs-learning/ui/components/button`, `@fumadocs-learning/api/routers/index`)
- **Package exports**: Each package uses `exports` field in package.json — import from subpaths, not barrel files where subpath exports exist
- **tRPC flow**: Routers defined in `packages/api` → mounted on Hono in `apps/server` → consumed by all client apps via tRPC client
- **Auth flow**: Config in `packages/auth` → mounted as Hono middleware in `apps/server` → client-side auth via Better Auth client SDK
- **DB schema**: All tables in `packages/db/src/schema/` → exported via `packages/db/src/schema/index.ts`
- **MDX content**: Docs pages in `apps/fumadocs/content/docs/<roadmap>/` use extended frontmatter (`roadmap`, `track`, `trackTitle`, `trackOrder`, `topicOrder`) to associate with roadmaps
- **Shared UI**: Add components to `packages/ui` with `npx shadcn@latest add <name> -c packages/ui`. Import as `@fumadocs-learning/ui/components/<name>`
