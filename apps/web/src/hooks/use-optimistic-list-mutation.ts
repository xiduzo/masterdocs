import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

/**
 * Generic wrapper around `useMutation` that owns the standard
 * cancel → snapshot → optimistic update → rollback → settle ceremony.
 *
 * Callsites describe **what** the optimistic next-state looks like via
 * `optimistic(cache, input)`; the hook owns **how** rollback is wired.
 * Any other `UseMutationOptions` (e.g. `mutationFn`, `onSuccess`,
 * `onSettled`, user-supplied `onError`) pass through.
 *
 * The hook's own onError runs the rollback first, then the caller's
 * `onError`. The mutation context surfaces `{ previous }` for any caller
 * that wants direct access to the pre-mutation snapshot.
 */
export interface UseOptimisticListMutationOptions<TInput, TOutput, TCache>
  extends Omit<
    UseMutationOptions<TOutput, Error, TInput, { previous: TCache | undefined }>,
    "onMutate"
  > {
  queryKey: QueryKey;
  optimistic: (cache: TCache | undefined, input: TInput) => TCache | undefined;
}

export function useOptimisticListMutation<TInput, TOutput, TCache = unknown>(
  opts: UseOptimisticListMutationOptions<TInput, TOutput, TCache>,
): UseMutationResult<TOutput, Error, TInput, { previous: TCache | undefined }> {
  const queryClient = useQueryClient();
  const { queryKey, optimistic, onError: userOnError, ...rest } = opts;

  return useMutation<TOutput, Error, TInput, { previous: TCache | undefined }>({
    ...rest,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TCache>(queryKey);
      queryClient.setQueryData<TCache>(queryKey, (cache) =>
        optimistic(cache, input),
      );
      return { previous };
    },
    onError: (error, input, context) => {
      if (context) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      userOnError?.(error, input, context);
    },
  });
}
