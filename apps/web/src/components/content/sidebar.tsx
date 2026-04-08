import { Badge } from "@fumadocs-learning/ui/components/badge";
import { Button } from "@fumadocs-learning/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@fumadocs-learning/ui/components/collapsible";
import { Separator } from "@fumadocs-learning/ui/components/separator";
import { Skeleton } from "@fumadocs-learning/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { NewFileDialog } from "@/components/content/new-file-dialog";
import { trpc } from "@/utils/trpc";
import { useState } from "react";

export function ContentSidebar() {
  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());
  const [newFileOpen, setNewFileOpen] = useState(false);

  const roadmapNames = data?.map((g) => g.roadmap) ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-semibold">Content</span>
        <Button size="xs" variant="outline" onClick={() => setNewFileOpen(!newFileOpen)}>
          + New File
        </Button>
      </div>
      <Separator />

      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        roadmaps={roadmapNames}
      />

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <SidebarSkeleton />
        ) : (
          data?.map((group) => (
            <RoadmapGroup key={group.roadmap} group={group} />
          ))
        )}
      </div>

      <Separator />
      <div className="p-3">
        <Link
          to="/admin/content/pending"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Pending Changes
        </Link>
      </div>
    </div>
  );
}

function RoadmapGroup({
  group,
}: {
  group: {
    roadmap: string;
    files: {
      slug: string;
      title: string;
      path: string;
      state: "published" | "pending_review";
    }[];
  };
}) {
  return (
    <Collapsible defaultOpen className="mb-1">
      <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <span className="transition-transform [[data-panel-open]>&]:rotate-90">
          ▸
        </span>
        {group.roadmap}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-3">
          {group.files.map((file) => (
            <Link
              key={file.slug}
              to="/admin/content/$roadmap/$slug"
              params={{ roadmap: group.roadmap, slug: file.slug }}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted transition-colors [&.active]:bg-muted [&.active]:font-medium"
            >
              <span className="truncate flex-1">{file.title}</span>
              {file.state === "pending_review" && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-600">
                  Pending
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-3 p-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-3 h-3.5 w-32" />
          <Skeleton className="ml-3 h-3.5 w-28" />
          <Skeleton className="ml-3 h-3.5 w-36" />
        </div>
      ))}
    </div>
  );
}
