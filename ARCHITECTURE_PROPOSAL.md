# Architecture Proposal — `apps/web`

> Consultant review as of 2026-04-09. All file paths are relative to `apps/web/src/`.

---

## Executive Summary

The codebase has a solid foundation: TanStack Router + tRPC + React Query is a well-chosen, type-safe stack. The main structural problems are **concentration of logic** (one file is doing the work of four), **React anti-patterns in state initialization**, **duplicated optimistic-update boilerplate**, and a **complete absence of tests**. None of these are architectural rewrites — they are disciplined refactors that will pay dividends immediately.

---

## What Is Working Well

Keep these — they represent good decisions:

- **tRPC end-to-end types.** Zero `any` propagation from server to UI, catch breaking changes at compile time.
- **React Query as server-state layer.** Cache invalidation, loading states, and retry UX are handled consistently.
- **File-based routing with TanStack Router.** `beforeLoad` auth guards are co-located with routes, predictable.
- **Lazy-loading the MDX editor** (`editor-view.tsx:14-16`). The editor bundle is large; splitting it is correct.
- **Suspense + skeleton fallbacks.** The loading UX is coherent.
- **Monorepo package boundaries.** `@masterdocs/api`, `@masterdocs/ui`, `@masterdocs/auth` separate concerns cleanly.

---

## Problems & Recommendations

### 1. `sidebar.tsx` is a God File

**Severity: High**

`components/content/sidebar.tsx` is ~350 lines containing:
- 6 data-transform utility functions (lines 97–249)
- Inline component definitions (`InlineCreateInput`, `InlineCreateRoadmap`, `InlineCreateTrack`)
- DnD sensor setup and 3 separate drag-end handlers
- All mutation logic for create/delete/reorder across roadmaps, tracks, and files
- The tree rendering itself

This violates the single-responsibility principle and makes every concern harder to test and reason about.

**Fix — split into 4 units:**

```
components/content/sidebar/
  index.tsx                  # Thin shell: compose sub-components, export ContentSidebar
  use-sidebar-mutations.ts   # All useMutation calls + optimistic helpers
  use-dnd-reorder.ts         # DnD sensors, drag-end handlers
  tree-utils.ts              # buildTree, reorder*, remove* pure functions (already pure, just move them)
  inline-create.tsx          # InlineCreateInput, InlineCreateRoadmap, InlineCreateTrack
```

The pure functions in lines 97–249 require zero logic changes — they are already side-effect free. Move them first, that's the easiest win.

---

### 2. State Initialization Anti-Pattern in `editor-view.tsx`

**Severity: High**

```tsx
// editor-view.tsx:40-44
if (data && initializedFor !== fileKey) {
  setFrontmatter(data.frontmatter);
  setBody(data.body);
  setInitializedFor(fileKey);
}
```

Calling `setState` unconditionally during render (outside an effect or event handler) causes React to immediately re-render the component, which can lead to inconsistent UI frames and makes the component's state transitions opaque. This pattern is fragile.

**Fix — use a key-based reset instead:**

The component already has `key={fileKey}` on the MDX editor (line 220). Apply the same `key` to the entire `ContentEditorView` from the route, and initialize state directly from `data` using a one-time initializer:

```tsx
// In the route component:
<ContentEditorView key={fileKey} ... />

// In ContentEditorView — remove initializedFor state entirely:
const [frontmatter, setFrontmatter] = useState<MdxFrontmatter | null>(
  () => data?.frontmatter ?? null
);
const [body, setBody] = useState<string | null>(() => data?.body ?? null);
```

When `fileKey` changes, React unmounts and remounts the component, triggering fresh state. The mid-render synchronization disappears.

---

### 3. Duplicated Optimistic Update Boilerplate

**Severity: Medium**

`handleSubmit` (lines 65-106) and `handlePublish` (lines 108-145) share an almost identical pattern:

1. `cancelQueries`
2. `getQueryData` (snapshot)
3. `setQueryData` (optimistic patch)
4. `mutate(...)` with `onError` rollback + `onSettled` invalidation

This pattern is copy-pasted. One wrong rollback key breaks both silently.

**Fix — extract a `useOptimisticContentMutation` hook:**

```ts
// hooks/use-optimistic-content-mutation.ts
function useOptimisticContentMutation<TVariables>(
  mutationOptions: ...,
  getOptimisticUpdate: (vars: TVariables, prev: ContentListGroup[]) => ContentListGroup[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    ...mutationOptions,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: contentListQueryKey });
      const previous = queryClient.getQueryData(contentListQueryKey);
      queryClient.setQueryData(contentListQueryKey, (prev) =>
        prev ? getOptimisticUpdate(vars, prev) : prev
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(contentListQueryKey, ctx?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contentListQueryKey });
    },
  });
}
```

Each mutation caller then only provides the pure "what does the optimistic state look like" function.

---

### 4. Auth Guard Doesn't Redirect Non-Admin Users

**Severity: Medium**

In `routes/admin/content/route.tsx:25-28`:

```tsx
if (session.data?.user.role !== "admin") {
  return { session, accessDenied: true }; // ← renders the route, then shows UI error
}
```

Non-admin users load the route, the sidebar query fires, and then the component renders an access-denied empty state. The query to fetch content runs unnecessarily.

**Fix — redirect in `beforeLoad` just like the unauthenticated case:**

```tsx
if (session.data?.user.role !== "admin") {
  redirect({ to: "/", throw: true });
}
return { session };
```

If an in-app "Access Denied" page is genuinely needed for this role, redirect to a dedicated `/unauthorized` route rather than conditionally rendering inside the protected layout.

---

### 5. Global `onError` Toast Fires for Every Failed Query

**Severity: Low-Medium**

`utils/trpc.ts:10-17`: The `QueryCache` `onError` shows a toast for *every* failed query globally. However, `editor-view.tsx` already has per-mutation `onError` handlers that also call `toast.error(...)`. When a mutation fails, two toasts appear.

**Fix — add a query-level opt-out, or scope the global handler to background refetches only:**

```ts
onError: (error, query) => {
  // Don't double-toast if the query has its own error handling
  if (query.meta?.silentError) return;
  toast.error(error.message, { action: { label: "retry", onClick: query.invalidate } });
},
```

Then tag the mutations/queries that self-handle with `meta: { silentError: true }`.

---

### 6. No Tests

**Severity: High (Risk)**

There are zero test files. No `*.test.tsx`, no Vitest config, no testing library.

The highest-risk untested code is:

| File | Risk |
|------|------|
| `utils/trpc.ts` — `queryClient` singleton | Any test that imports this gets a shared cache |
| `sidebar.tsx` — `buildTree`, `reorderTracks`, `reorderTrackFiles` | Pure functions, trivially unit testable today |
| `routes/*/beforeLoad` | Auth bypass bugs are invisible without tests |
| `editor-view.tsx` — optimistic updates | Rollback logic especially |

**Recommended starting point (highest ROI, lowest effort):**

1. Add Vitest + `@testing-library/react` to devDependencies.
2. Write unit tests for the pure tree utilities (`buildTree`, `reorder*`, `remove*`). These are already pure functions — tests require no mocking.
3. Write integration tests for `beforeLoad` auth guards using TanStack Router's `createMemoryHistory` test utilities.

---

### 7. Separate Behaviour From Display With Query Hooks

**Severity: Medium**

Currently, every component that fetches data mixes three concerns in one file: data fetching, derived state, and JSX. This is not wrong for small components, but it becomes a problem as components grow.

The clearest example is `editor-view.tsx`. The component is 276 lines. The first 159 lines are entirely behaviour — queries, mutations, state, event handlers, optimistic updates. The last 116 lines are JSX. The two halves have nothing in common except that they live in the same function.

**The case for extraction:**

- **Testability.** A custom hook can be tested with `renderHook` in isolation — no DOM, no `Suspense`, no event simulation needed. The optimistic-update rollback logic in particular (the most fragile code in the file) becomes trivially testable.
- **Readability.** The component becomes a pure display contract: "given this data, render this." Someone debugging a UI layout bug no longer has to read 130 lines of mutation logic to find the JSX.
- **The hook already has a natural API.** The component only consumes: `data`, `isLoading`, `error`, `frontmatter`, `setFrontmatter`, `body`, `setBody`, `handleSubmit`, `handlePublish`, `handleDiscard`, `submitMutation.isPending`, etc. That is a clean, stable interface.

**Fix — extract `useContentEditor`:**

```ts
// hooks/use-content-editor.ts
export function useContentEditor({ roadmap, slug, track, fromBranch }: ContentEditorViewProps) {
  // All useQuery, useMutation, useState, optimistic update logic lives here
  // Returns only what the component needs to render
  return {
    data, isLoading, error,
    frontmatter, setFrontmatter,
    body, setBody,
    hasConflict,
    isPending,
    displayPath,
    handleSubmit, handlePublish, handleDiscard,
    submitMutation, publishMutation, discardMutation,
    editorRef,
  };
}
```

The component then becomes:

```tsx
export function ContentEditorView(props: ContentEditorViewProps) {
  const { isLoading, error, data, ...handlers } = useContentEditor(props);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;

  return ( /* pure JSX, ~116 lines */ );
}
```

**When this pattern is worth it vs. over-engineering:**

Apply this only when a component has ≥3 queries/mutations OR has non-trivial derived state. For small components (`sign-in-form.tsx`, `mode-toggle.tsx`) this is unnecessary indirection. The rule: if extracting the hook makes the component read like a layout spec, do it. If it just moves lines to another file, skip it.

**For the sidebar**, the proposed split already follows this pattern — `use-sidebar-mutations.ts` and `use-dnd-reorder.ts` are exactly custom hooks that separate behaviour from the render tree. The same principle, applied consistently.

---

### 8. Local Types Drift From the API Contract

**Severity: Low**

`sidebar.tsx:61-93` defines `ContentFile`, `FileNode`, `FolderNode`, `TreeNode`, `ContentListGroup` locally. These are manually maintained copies of shapes that come from the API. If the API changes a field name, TypeScript will only catch it at the call site, not in the tree logic.

**Fix — derive these types from the AppRouter:**

```ts
import type { RouterOutputs } from "@/utils/trpc";
type ContentListGroup = RouterOutputs["content"]["list"][number];
type ContentFile = ContentListGroup["files"][number];
```

Then `FileNode` / `FolderNode` / `TreeNode` can be local view-model types that are constructed *from* the API types, not duplicated alongside them.

---

## Priority Order

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | Split `sidebar.tsx` god file | Medium | High |
| 2 | Fix state initialization anti-pattern | Low | High |
| 3 | Add tests for pure functions | Low | High (risk reduction) |
| 4 | Fix auth guard redirect | Low | Medium |
| 5 | Extract `useContentEditor` hook (behaviour/display split) | Low | Medium |
| 6 | Extract optimistic update hook | Medium | Medium |
| 7 | Derive types from AppRouter | Low | Low-Medium |
| 8 | Scope global query error handler | Low | Low |

Items 2, 3, 4, and 5 can be done in a single afternoon. Items 1 and 6 are the bigger structural improvements and should follow in the next sprint. Note that items 1 and 5 share the same underlying principle — they should be done together or in immediate sequence so the pattern is applied consistently across the feature.

---

## What Not to Change

- The tRPC + React Query setup in `utils/trpc.ts` — it is clean and correct.
- The `beforeLoad` session check pattern in routes — it is the right place for auth logic.
- The `lazy()` pattern for the MDX editor — keep it.
- The monorepo package split — it is well-structured.
- `@masterdocs/ui` component library usage — consistent and correct.
