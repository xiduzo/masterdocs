import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { MdxFrontmatter } from "@fumadocs-learning/api/lib/mdx";
import { Alert, AlertTitle } from "@fumadocs-learning/ui/components/alert";
import { Button } from "@fumadocs-learning/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fumadocs-learning/ui/components/card";
import { ScrollArea } from "@fumadocs-learning/ui/components/scroll-area";
import { Textarea } from "@fumadocs-learning/ui/components/textarea";

import { trpc } from "@/utils/trpc";

interface ConflictResolverProps {
  changeRecordId: string;
  mainBody: string;
  submittedBody: string;
  submittedFrontmatter?: MdxFrontmatter;
  onResolved: () => void;
}

export function ConflictResolver({
  changeRecordId,
  mainBody,
  submittedBody,
  submittedFrontmatter,
  onResolved,
}: ConflictResolverProps) {
  const [mode, setMode] = useState<"compare" | "edit">("compare");
  const [manualBody, setManualBody] = useState(submittedBody);

  const resolveMutation = useMutation(
    trpc.content.resolveConflict.mutationOptions(),
  );

  const handleKeepMine = () => {
    resolveMutation.mutate(
      { changeRecordId, strategy: "keep_mine" },
      {
        onSuccess: () => {
          toast.success("Conflict resolved — kept your changes");
          onResolved();
        },
        onError: (err) => {
          toast.error(`Resolution failed: ${err.message}`);
        },
      },
    );
  };

  const handleUseMain = () => {
    resolveMutation.mutate(
      { changeRecordId, strategy: "use_main" },
      {
        onSuccess: () => {
          toast.success("Conflict resolved — reverted to published version");
          onResolved();
        },
        onError: (err) => {
          toast.error(`Resolution failed: ${err.message}`);
        },
      },
    );
  };

  const handleSubmitManual = () => {
    const frontmatter: MdxFrontmatter = submittedFrontmatter ?? {
      title: "Untitled",
    };

    resolveMutation.mutate(
      {
        changeRecordId,
        strategy: "manual",
        manualContent: { frontmatter, body: manualBody },
      },
      {
        onSuccess: () => {
          toast.success("Conflict resolved — combined content submitted");
          onResolved();
        },
        onError: (err) => {
          toast.error(`Resolution failed: ${err.message}`);
        },
      },
    );
  };

  if (mode === "edit") {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Combine manually</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode("compare")}
          >
            Back to comparison
          </Button>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Reference: published version (read-only) */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Published version (reference)
              </span>
              <ScrollArea className="max-h-80">
                <pre className="rounded border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                  {mainBody}
                </pre>
              </ScrollArea>
            </div>

            {/* Editable combined content */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Combined content (editable)
              </span>
              <Textarea
                className="max-h-80 min-h-40 resize-y font-mono text-xs"
                value={manualBody}
                onChange={(e) => setManualBody(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmitManual}
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending
                ? "Submitting…"
                : "Submit combined content"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>Editing conflict</AlertTitle>

      {/* Side-by-side comparison */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Published version
          </span>
          <ScrollArea className="max-h-64">
            <pre className="rounded border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
              {mainBody}
            </pre>
          </ScrollArea>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Your Version
          </span>
          <ScrollArea className="max-h-64">
            <pre className="rounded border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
              {submittedBody}
            </pre>
          </ScrollArea>
        </div>
      </div>

      {/* Resolution actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={handleKeepMine}
          disabled={resolveMutation.isPending}
        >
          {resolveMutation.isPending ? "Resolving…" : "Keep My Changes"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleUseMain}
          disabled={resolveMutation.isPending}
        >
          {resolveMutation.isPending ? "Resolving…" : "Use published version"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setMode("edit")}
          disabled={resolveMutation.isPending}
        >
          Edit Manually
        </Button>
      </div>
    </Alert>
  );
}
