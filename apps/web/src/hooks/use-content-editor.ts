import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { MdxFrontmatter } from "@masterdocs/api/lib/mdx";

import { trpc } from "@/utils/trpc";

interface ContentEditorProps {
  roadmap: string;
  slug: string;
  track?: string;
  fromBranch?: boolean;
}

export function useContentEditor({ roadmap, slug, track, fromBranch }: ContentEditorProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    ...trpc.content.get.queryOptions({ roadmap, track, slug, fromBranch }),
    meta: { silentError: true },
  });

  // Lazy initializer captures cached data on mount; effect handles async load.
  // The component is keyed per file at the route level, so these initialize fresh per file.
  const [frontmatter, setFrontmatter] = useState<MdxFrontmatter | null>(
    () => data?.frontmatter ?? null,
  );
  const [body, setBody] = useState<string | null>(() => data?.body ?? null);

  // One-time initialization for cache-miss case (data arrives after mount)
  const initialized = useRef(data !== undefined);
  useEffect(() => {
    if (!initialized.current && data) {
      initialized.current = true;
      setFrontmatter(data.frontmatter);
      setBody(data.body);
    }
  }, [data]);

  const prNumber = data?.changeRecord?.prNumber;
  const conflictQuery = useQuery({
    ...trpc.content.checkConflict.queryOptions({ prNumber: prNumber! }),
    enabled: !!prNumber,
  });

  const submitMutation = useMutation(trpc.content.submit.mutationOptions());
  const publishMutation = useMutation(trpc.content.publish.mutationOptions());
  const discardMutation = useMutation(trpc.content.discard.mutationOptions());

  const contentListQueryKey = trpc.content.list.queryKey();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: trpc.content.get.queryKey() });
    queryClient.invalidateQueries({ queryKey: contentListQueryKey });
    queryClient.invalidateQueries({ queryKey: trpc.content.listPending.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.content.checkConflict.queryKey() });
  };

  const handleSubmit = async () => {
    if (!frontmatter || body === null) return;

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousList = queryClient.getQueryData(contentListQueryKey);
    queryClient.setQueryData(contentListQueryKey, (groups) => {
      if (!groups) return groups;
      return groups.map((g) =>
        g.roadmap === roadmap
          ? {
              ...g,
              files: g.files.map((f) =>
                f.slug === slug && f.track === track
                  ? { ...f, state: "pending_review" as const, title: frontmatter.title }
                  : f,
              ),
            }
          : g,
      );
    });

    submitMutation.mutate(
      { roadmap, track, slug, frontmatter, body, fileSha: data?.fileSha },
      {
        onSuccess: (result) => {
          toast.success(result.isNew ? "Submitted for review" : "Submission updated");
        },
        onError: (err) => {
          queryClient.setQueryData(contentListQueryKey, previousList);
          toast.error(`Submit failed: ${err.message}`);
        },
        onSettled: () => invalidateAll(),
      },
    );
  };

  const handlePublish = async () => {
    if (!prNumber) return;

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousList = queryClient.getQueryData(contentListQueryKey);
    queryClient.setQueryData(contentListQueryKey, (groups) => {
      if (!groups) return groups;
      return groups.map((g) =>
        g.roadmap === roadmap
          ? {
              ...g,
              files: g.files.map((f) =>
                f.slug === slug && f.track === track
                  ? { ...f, state: "published" as const }
                  : f,
              ),
            }
          : g,
      );
    });

    publishMutation.mutate(
      { prNumber },
      {
        onSuccess: () => toast.success("Published successfully"),
        onError: (err) => {
          queryClient.setQueryData(contentListQueryKey, previousList);
          toast.error(`Publish failed: ${err.message}`);
        },
        onSettled: () => invalidateAll(),
      },
    );
  };

  const handleDiscard = () => {
    if (!prNumber) return;
    discardMutation.mutate(
      { prNumber },
      {
        onSuccess: () => {
          toast.success("Changes discarded");
          invalidateAll();
        },
        onError: (err) => toast.error(`Discard failed: ${err.message}`),
      },
    );
  };

  return {
    data,
    isLoading,
    error,
    frontmatter,
    setFrontmatter,
    body,
    setBody,
    isPending: data?.state === "pending_review",
    hasConflict: conflictQuery.data?.hasConflict === true,
    displayPath: track ? `${roadmap}/${track}/${slug}` : `${roadmap}/${slug}`,
    handleSubmit,
    handlePublish,
    handleDiscard,
    submitMutation,
    publishMutation,
    discardMutation,
  };
}
