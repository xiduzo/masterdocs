import { Badge } from "@masterdocs/ui/components/badge";
import { Button } from "@masterdocs/ui/components/button";
import { Card, CardContent } from "@masterdocs/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@masterdocs/ui/components/empty";
import { Separator } from "@masterdocs/ui/components/separator";
import { SidebarTrigger } from "@masterdocs/ui/components/sidebar";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/admin/content/pending")({
  component: PendingChanges,
});

/** Extract roadmap and slug from a file path like "apps/fumadocs/content/docs/arduino/getting-started.mdx" */
function parseFilePath(filePath: string) {
  const parts = filePath.split("/");
  const slug = parts.pop()?.replace(/\.mdx$/, "") ?? "";
  const roadmap = parts.pop() ?? "";
  return { roadmap, slug };
}

function PendingChanges() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    trpc.content.listPending.queryOptions(),
  );
  const discardMutation = useMutation(trpc.content.discard.mutationOptions());

  const handleDiscard = (changeRecordId: string) => {
    discardMutation.mutate(
      { changeRecordId },
      {
        onSuccess: () => {
          toast.success("Change discarded");
          queryClient.invalidateQueries({
            queryKey: trpc.content.listPending.queryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.content.list.queryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.content.get.queryKey(),
          });
        },
        onError: (err) => {
          toast.error(`Discard failed: ${err.message}`);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-semibold">Pending Changes</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">

      {!data || data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No pending changes</EmptyTitle>
            <EmptyDescription>
              No pending changes at the moment.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {data.map((record) => {
            const { roadmap, slug } = parseFilePath(record.filePath);
            return (
              <Card key={record.id} size="sm">
                <CardContent className="flex items-center justify-between">
                  <Link
                    to="/admin/content/$roadmap/$slug"
                    params={{ roadmap, slug }}
                    search={{ fromBranch: true }}
                    className="flex-1 hover:underline"
                  >
                    <p className="text-sm font-medium">{roadmap} / {slug}</p>
                    <p className="text-xs text-muted-foreground">
                      by {record.submitterName} ·{" "}
                      {new Date(record.createdAt).toLocaleString()}
                    </p>
                  </Link>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Submission #{record.prNumber}</Badge>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDiscard(record.id)}
                      disabled={discardMutation.isPending}
                    >
                      Discard
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
