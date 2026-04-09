import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import type { MDXEditorMethods } from "@mdxeditor/editor";

import type { MdxFrontmatter } from "@masterdocs/api/lib/mdx";
import { Alert, AlertDescription, AlertTitle } from "@masterdocs/ui/components/alert";
import { Badge } from "@masterdocs/ui/components/badge";
import { Button } from "@masterdocs/ui/components/button";
import { Separator } from "@masterdocs/ui/components/separator";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import { SidebarTrigger } from "@masterdocs/ui/components/sidebar";

const MdxContentEditor = lazy(() =>
  import("@/components/content/mdx-editor").then((m) => ({ default: m.ContentEditor })),
);
import { FrontmatterForm } from "@/components/content/frontmatter-form";
import { trpc } from "@/utils/trpc";

interface ContentEditorViewProps {
  roadmap: string;
  slug: string;
  track?: string;
  fromBranch?: boolean;
}

export function ContentEditorView({ roadmap, slug, track, fromBranch }: ContentEditorViewProps) {
  const queryClient = useQueryClient();
  const editorRef = useRef<MDXEditorMethods>(null);

  const { data, isLoading, error } = useQuery(
    trpc.content.get.queryOptions({ roadmap, track, slug, fromBranch }),
  );

  const [frontmatter, setFrontmatter] = useState<MdxFrontmatter | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const fileKey = `${roadmap}/${track ?? ""}/${slug}`;
  if (data && initializedFor !== fileKey) {
    setFrontmatter(data.frontmatter);
    setBody(data.body);
    setInitializedFor(fileKey);
  }

  const prNumber = data?.changeRecord?.prNumber;
  const conflictQuery = useQuery({
    ...trpc.content.checkConflict.queryOptions({
      prNumber: prNumber!,
    }),
    enabled: !!prNumber,
  });

  const submitMutation = useMutation(trpc.content.submit.mutationOptions());
  const publishMutation = useMutation(trpc.content.publish.mutationOptions());
  const discardMutation = useMutation(trpc.content.discard.mutationOptions());

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: trpc.content.get.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.content.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.content.listPending.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.content.checkConflict.queryKey() });
  };

  const handleSubmit = async () => {
    if (!frontmatter || body === null) return;

    await queryClient.cancelQueries({ queryKey: trpc.content.list.queryKey() });
    const previousList = queryClient.getQueryData(trpc.content.list.queryKey());
    queryClient.setQueryData(
      trpc.content.list.queryKey(),
      (groups) => {
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
      },
    );

    submitMutation.mutate(
      { roadmap, track, slug, frontmatter, body, fileSha: data?.fileSha },
      {
        onSuccess: (result) => {
          toast.success(
            result.isNew
              ? "Submitted for review"
              : "Submission updated",
          );
        },
        onError: (err) => {
          queryClient.setQueryData(trpc.content.list.queryKey(), previousList);
          toast.error(`Submit failed: ${err.message}`);
        },
        onSettled: () => invalidateQueries(),
      },
    );
  };

  const handlePublish = async () => {
    if (!prNumber) return;

    await queryClient.cancelQueries({ queryKey: trpc.content.list.queryKey() });
    const previousList = queryClient.getQueryData(trpc.content.list.queryKey());
    queryClient.setQueryData(
      trpc.content.list.queryKey(),
      (groups) => {
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
      },
    );

    publishMutation.mutate(
      { prNumber },
      {
        onSuccess: () => {
          toast.success("Published successfully");
        },
        onError: (err) => {
          queryClient.setQueryData(trpc.content.list.queryKey(), previousList);
          toast.error(`Publish failed: ${err.message}`);
        },
        onSettled: () => invalidateQueries(),
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
          invalidateQueries();
        },
        onError: (err) => toast.error(`Discard failed: ${err.message}`),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert variant="destructive">
          <AlertTitle>Failed to load file</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data || !frontmatter || body === null) return null;

  const isPending = data.state === "pending_review";
  const hasConflict = conflictQuery.data?.hasConflict === true;
  const displayPath = track ? `${roadmap}/${track}/${slug}` : `${roadmap}/${slug}`;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Center: editor / preview ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Sticky header */}
        <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-sm font-semibold">
            {displayPath}
          </h1>
          {isPending && (
            <Badge variant="outline" className="text-amber-600">
              Pending Review
            </Badge>
          )}
        </div>

        {/* Conflict warning */}
        {hasConflict && (
          <Alert variant="destructive" className="mx-4 mt-3 shrink-0">
            <AlertTitle>Update available</AlertTitle>
            <AlertDescription>
              The published version was updated since you submitted this change — please review the differences before publishing.
            </AlertDescription>
          </Alert>
        )}

        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense fallback={<div className="p-6"><Skeleton className="h-64 w-full" /></div>}>
            <MdxContentEditor
              key={fileKey}
              ref={editorRef}
              markdown={body}
              diffMarkdown={data.mainBody}
              className="h-full"
              onChange={setBody}
            />
          </Suspense>
        </div>
      </div>

      {/* ── Right sidebar: properties + actions ── */}
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l">
        {/* Sticky header */}
        <div className="border-b px-4 py-2">
          <span className="text-sm font-semibold">Properties</span>
        </div>

        {/* Scrollable frontmatter */}
        <div className="flex-1 overflow-y-auto p-4">
          <FrontmatterForm frontmatter={frontmatter} onChange={setFrontmatter} isIndex={slug === "index"} />
        </div>

        {/* Actions pinned to bottom */}
        <div className="shrink-0 space-y-2 border-t p-4">
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting…" : "Submit"}
          </Button>

          {isPending && (
            <>
              <Button
                className="w-full"
                onClick={handlePublish}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? "Publishing…" : "Publish"}
              </Button>
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleDiscard}
                disabled={discardMutation.isPending}
              >
                {discardMutation.isPending ? "Discarding…" : "Discard"}
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
