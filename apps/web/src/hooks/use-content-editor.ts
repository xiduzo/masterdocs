import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { MdxFrontmatter } from "@masterdocs/api/lib/mdx";
import {
  updateContentFile,
  type ContentList,
} from "@masterdocs/api/lib/content-list-cache";

import { useContentMutation } from "@/hooks/use-content-mutation";
import { trpc } from "@/utils/trpc";

interface ContentEditorProps {
  roadmap: string;
  slug: string;
  track?: string;
  fromBranch?: boolean;
}

export function useContentEditor({ roadmap, slug, track, fromBranch }: ContentEditorProps) {
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

  const submitMutation = useContentMutation({
    ...trpc.content.submit.mutationOptions(),
    optimistic: (groups: ContentList | undefined, input) =>
      updateContentFile(
        groups,
        { roadmap: input.roadmap, slug: input.slug, track: input.track },
        (f) => ({
          ...f,
          state: "pending_review" as const,
          title: input.frontmatter.title,
        }),
      ),
    successMessage: (result) =>
      result.isNew ? "Submitted for review" : "Submission updated",
    errorPrefix: "Submit failed",
  });

  const publishMutation = useContentMutation({
    ...trpc.content.publish.mutationOptions(),
    optimistic: (groups: ContentList | undefined) =>
      updateContentFile(groups, { roadmap, slug, track }, (f) => ({
        ...f,
        state: "published" as const,
      })),
    successMessage: "Published successfully",
    errorPrefix: "Publish failed",
  });

  const discardMutation = useContentMutation({
    ...trpc.content.discard.mutationOptions(),
    successMessage: "Changes discarded",
    errorPrefix: "Discard failed",
  });

  const handleSubmit = () => {
    if (!frontmatter || body === null) return;
    submitMutation.mutate({
      roadmap,
      track,
      slug,
      frontmatter,
      body,
      fileSha: data?.fileSha,
    });
  };

  const handlePublish = () => {
    if (!prNumber) return;
    publishMutation.mutate({ prNumber });
  };

  const handleDiscard = () => {
    if (!prNumber) return;
    discardMutation.mutate({ prNumber });
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
