import { createTrpcClient, type RouterOutputs } from "@masterdocs/api/client";
import { env } from "@masterdocs/env/web";
import { toast } from "sonner";

export type { RouterOutputs };

export const { queryClient, trpcClient, trpc } = createTrpcClient({
  trpcUrl: `${env.VITE_SERVER_URL}/trpc`,
  fetch: (url, options) =>
    fetch(url, { ...options, credentials: "include" }),
  onQueryError: (error, query) => {
    toast.error(error.message, {
      action: {
        label: "retry",
        onClick: query.invalidate,
      },
    });
  },
});
