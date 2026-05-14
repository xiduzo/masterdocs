/**
 * Shared tRPC client factory.
 *
 * Each app (web, fumadocs, native) used to copy-paste roughly the same
 * QueryClient + tRPC client setup, with minor differences in URL, fetch
 * credentials, and error-toast wiring. This factory centralises the
 * common shape and exposes the variations as options.
 *
 * Per ARCHITECTURE_PROPOSAL.md item 5, the global error toast was the
 * one piece of behaviour that made the queryClient untestable. It is
 * now an injection point (`onQueryError`) and queries can opt out via
 * `meta.silentError` exactly as before.
 */

import type { QueryClientConfig } from "@tanstack/react-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "./routers/index";

export type { AppRouter };
export type RouterOutputs = inferRouterOutputs<AppRouter>;

type BatchLinkOptions = Parameters<typeof httpBatchLink>[0];
type QueryCacheOnError = NonNullable<
  ConstructorParameters<typeof QueryCache>[0]
>["onError"];
type QueryArg = Parameters<NonNullable<QueryCacheOnError>>[1];

export interface CreateTrpcClientOptions {
  /** Full URL to the tRPC endpoint, e.g. `${SERVER_URL}/trpc`. */
  trpcUrl: string;
  /** Per-request fetch customization (credentials, cookie forwarding, etc.). */
  fetch?: BatchLinkOptions["fetch"];
  /** Per-request headers, e.g. to forward an auth cookie. */
  headers?: BatchLinkOptions["headers"];
  /** QueryClient defaults forwarded directly. */
  defaultOptions?: QueryClientConfig["defaultOptions"];
  /**
   * Called when a non-silent query error is raised. Wire to the app's
   * toast/notification system. Omit to suppress global error reporting.
   * Per-query opt-out is available via `meta: { silentError: true }`.
   */
  onQueryError?: (error: Error, query: QueryArg) => void;
}

export function createTrpcClient(opts: CreateTrpcClientOptions) {
  const queryClient = new QueryClient({
    defaultOptions: opts.defaultOptions,
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.silentError) return;
        opts.onQueryError?.(error as Error, query);
      },
    }),
  });

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: opts.trpcUrl,
        fetch: opts.fetch,
        headers: opts.headers,
      }),
    ],
  });

  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
  });

  return { queryClient, trpcClient, trpc };
}
