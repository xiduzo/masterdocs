import { lazy, Suspense, useRef } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";

import { Alert, AlertDescription, AlertTitle } from "@masterdocs/ui/components/alert";
import { Badge } from "@masterdocs/ui/components/badge";
import { Button } from "@masterdocs/ui/components/button";
import { Skeleton } from "@masterdocs/ui/components/skeleton";

const MdxContentEditor = lazy(() =>
  import("@/components/content/mdx-editor").then((m) => ({ default: m.ContentEditor })),
);
import { FrontmatterForm } from "@/components/content/frontmatter-form";
import { useContentEditor } from "@/hooks/use-content-editor";

interface ContentEditorViewProps {
  roadmap: string;
  slug: string;
  track?: string;
  fromBranch?: boolean;
}

export function ContentEditorView(props: ContentEditorViewProps) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const {
    data,
    isLoading,
    error,
    frontmatter,
    setFrontmatter,
    body,
    setBody,
    isPending,
    hasConflict,
    displayPath,
    handleSubmit,
    handlePublish,
    handleDiscard,
    submitMutation,
    publishMutation,
    discardMutation,
  } = useContentEditor(props);

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

  const fileKey = `${props.roadmap}/${props.track ?? ""}/${props.slug}`;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Center: editor / preview ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Sticky header */}
        <div className="flex items-center gap-2 border-b bg-background px-4 py-2.5">
          <h1 className="text-sm font-semibold text-muted-foreground">
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
          <FrontmatterForm frontmatter={frontmatter} onChange={setFrontmatter} isIndex={props.slug === "index"} />
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
