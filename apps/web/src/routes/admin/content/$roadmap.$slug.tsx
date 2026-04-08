import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import type { MdxFrontmatter } from "@fumadocs-learning/api/lib/mdx";
import { Alert, AlertDescription, AlertTitle } from "@fumadocs-learning/ui/components/alert";
import { Badge } from "@fumadocs-learning/ui/components/badge";
import { Button } from "@fumadocs-learning/ui/components/button";
import { Separator } from "@fumadocs-learning/ui/components/separator";
import { Skeleton } from "@fumadocs-learning/ui/components/skeleton";
import { SidebarTrigger } from "@fumadocs-learning/ui/components/sidebar";

import {
  BodyEditor,
  type BodyEditorHandle,
} from "@/components/content/body-editor";
import { FrontmatterForm } from "@/components/content/frontmatter-form";
import { PreviewPanel } from "@/components/content/preview-panel";
import { trpc } from "@/utils/trpc";

const searchSchema = z.object({
  fromBranch: z.boolean().optional(),
});

export const Route = createFileRoute("/admin/content/$roadmap/$slug")({
  component: ContentEditor,
  validateSearch: searchSchema,
});

function ContentEditor() {
  const { roadmap, slug } = Route.useParams();
  const { fromBranch } = Route.useSearch();
  const queryClient = useQueryClient();
  const bodyEditorRef = useRef<BodyEditorHandle>(null);

  const { data, isLoading, error } = useQuery(
    trpc.content.get.queryOptions({ roadmap, slug, fromBranch }),
  );

  const [frontmatter, setFrontmatter] = useState<MdxFrontmatter | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const fileKey = `${roadmap}/${slug}`;
  if (data && initializedFor !== fileKey) {
    setFrontmatter(data.frontmatter);
    setBody(data.body);
    setInitializedFor(fileKey);
  }

  const changeRecordId = data?.changeRecord?.id;
  const conflictQuery = useQuery({
    ...trpc.content.checkConflict.queryOptions({
      changeRecordId: changeRecordId!,
    }),
    enabled: !!changeRecordId,
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

  const handleSubmit = () => {
    if (!frontmatter || body === null) return;
    submitMutation.mutate(
      { roadmap, slug, frontmatter, body, fileSha: data?.fileSha },
      {
        onSuccess: (result) => {
          toast.success(
            result.isNew
              ? "Submitted for review"
              : "Submission updated",
          );
          invalidateQueries();
        },
        onError: (err) => toast.error(`Submit failed: ${err.message}`),
      },
    );
  };

  const handlePublish = () => {
    if (!changeRecordId) return;
    publishMutation.mutate(
      { changeRecordId },
      {
        onSuccess: () => {
          toast.success("Published successfully");
          invalidateQueries();
        },
        onError: (err) => toast.error(`Publish failed: ${err.message}`),
      },
    );
  };

  const handleDiscard = () => {
    if (!changeRecordId) return;
    discardMutation.mutate(
      { changeRecordId },
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Center: editor / preview ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sticky header */}
        <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-sm font-semibold">
            {roadmap}/{slug}
          </h1>
          {isPending && (
            <Badge variant="outline" className="text-amber-600">
              Pending Review
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
            <Button
              size="xs"
              variant={mode === "edit" ? "secondary" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setMode("edit")}
            >
              Edit
            </Button>
            <Button
              size="xs"
              variant={mode === "preview" ? "secondary" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setMode("preview")}
            >
              Preview
            </Button>
          </div>
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

        {/* Editor or preview content */}
        <div className="flex-1 overflow-y-auto">
          {mode === "preview" ? (
            <div className="h-full p-6">
              <PreviewPanel body={body} visible={true} />
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <BodyEditor ref={bodyEditorRef} body={body} onChange={setBody} />
            </div>
          )}
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
          <FrontmatterForm frontmatter={frontmatter} onChange={setFrontmatter} isIndex={slug === roadmap} />
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
