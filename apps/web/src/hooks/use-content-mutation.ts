import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

import type { ContentList } from "@masterdocs/api/lib/content-list-cache";

import { trpc } from "@/utils/trpc";

/**
 * Owns the client-cache lifecycle for every Submission verb:
 * optional optimistic patch over the `content.list` cache → rollback on
 * error → invalidate the four content query keys on settle → success/error
 * toasts. Callsites describe **what** changes (`optimistic`) and **what**
 * to say (`successMessage`/`errorPrefix`); the hook owns **how** to wire
 * the ceremony.
 *
 * `optimistic` is optional — mutations without a natural list patch
 * (`create*`, `delete*`, `reorder`) still get invalidation + toasts.
 */
export type ContentMutationContext = { previous: ContentList | undefined };

export interface UseContentMutationOptions<TInput, TOutput, TError = Error>
  extends Omit<
    UseMutationOptions<TOutput, TError, TInput, ContentMutationContext>,
    "onMutate"
  > {
  optimistic?: (
    cache: ContentList | undefined,
    input: TInput,
  ) => ContentList | undefined;
  successMessage?: string | ((result: TOutput, input: TInput) => string);
  errorPrefix?: string;
}

export function useContentMutation<TInput, TOutput, TError = Error>(
  opts: UseContentMutationOptions<TInput, TOutput, TError>,
): UseMutationResult<TOutput, TError, TInput, ContentMutationContext> {
  const queryClient = useQueryClient();
  const contentListKey = trpc.content.list.queryKey();

  const {
    optimistic,
    successMessage,
    errorPrefix,
    onSuccess: userOnSuccess,
    onError: userOnError,
    onSettled: userOnSettled,
    ...rest
  } = opts;

  return useMutation<TOutput, TError, TInput, ContentMutationContext>({
    ...rest,
    onMutate: optimistic
      ? async (input) => {
          await queryClient.cancelQueries({ queryKey: contentListKey });
          const previous = queryClient.getQueryData<ContentList>(contentListKey);
          queryClient.setQueryData<ContentList>(contentListKey, (cache) =>
            optimistic(cache, input),
          );
          return { previous };
        }
      : undefined,
    onSuccess: (data, input, context, mutationContext) => {
      if (successMessage !== undefined) {
        const msg =
          typeof successMessage === "function"
            ? successMessage(data, input)
            : successMessage;
        toast.success(msg);
      }
      userOnSuccess?.(data, input, context, mutationContext);
    },
    onError: (error, input, context, mutationContext) => {
      if (context && context.previous !== undefined) {
        queryClient.setQueryData(contentListKey, context.previous);
      }
      if (errorPrefix !== undefined) {
        const msg = (error as Error).message;
        toast.error(errorPrefix.length > 0 ? `${errorPrefix}: ${msg}` : msg);
      }
      userOnError?.(error, input, context, mutationContext);
    },
    onSettled: (data, error, input, context, mutationContext) => {
      queryClient.invalidateQueries({ queryKey: contentListKey });
      queryClient.invalidateQueries({
        queryKey: trpc.content.get.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.content.listPending.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.content.checkConflict.queryKey(),
      });
      userOnSettled?.(data, error, input, context, mutationContext);
    },
  });
}
