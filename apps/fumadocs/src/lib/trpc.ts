import { createTrpcClient } from "@masterdocs/api/client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

export const { queryClient, trpcClient, trpc } = createTrpcClient({
  trpcUrl: `${SERVER_URL}/trpc`,
  fetch: (url, options) =>
    fetch(url, { ...options, credentials: "include" }),
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
});
