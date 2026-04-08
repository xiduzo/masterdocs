import { Button } from "@fumadocs-learning/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@fumadocs-learning/ui/components/collapsible";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@fumadocs-learning/ui/components/sidebar";
import { Skeleton } from "@fumadocs-learning/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { ChevronRight, File, FilePlus, Folder, FolderOpen, GitPullRequest } from "lucide-react";
import { useState } from "react";

import { NewFileDialog } from "@/components/content/new-file-dialog";
import { trpc } from "@/utils/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentFile = {
  slug: string;
  title: string;
  path: string;
  state: "published" | "pending_review";
  track?: string;
  trackTitle?: string;
  trackOrder?: number;
  topicOrder?: number;
};

type FileNode = {
  type: "file";
  name: string;
  slug: string;
  roadmap: string;
  state: "published" | "pending_review";
};

type FolderNode = {
  type: "folder";
  name: string;
  defaultOpen?: boolean;
  children: TreeNode[];
};

type TreeNode = FileNode | FolderNode;

// ─── Data transform ───────────────────────────────────────────────────────────

function buildTree(groups: { roadmap: string; files: ContentFile[] }[]): TreeNode[] {
  return groups.map((group) => {
    const trackMap = new Map<string, ContentFile[]>();
    const untracked: ContentFile[] = [];

    for (const file of group.files) {
      if (file.track) {
        const bucket = trackMap.get(file.track) ?? [];
        bucket.push(file);
        trackMap.set(file.track, bucket);
      } else {
        untracked.push(file);
      }
    }

    const sortByTopic = (a: ContentFile, b: ContentFile) => {
      if (a.topicOrder !== undefined && b.topicOrder !== undefined)
        return a.topicOrder - b.topicOrder;
      if (a.topicOrder !== undefined) return -1;
      if (b.topicOrder !== undefined) return 1;
      return a.title.localeCompare(b.title);
    };

    const tracks = [...trackMap.entries()].sort(([, a], [, b]) => {
      const ao = a[0]?.trackOrder;
      const bo = b[0]?.trackOrder;
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return (a[0]?.track ?? "").localeCompare(b[0]?.track ?? "");
    });

    const toFileNode = (file: ContentFile): FileNode => ({
      type: "file",
      name: file.title,
      slug: file.slug,
      roadmap: group.roadmap,
      state: file.state,
    });

    const children: TreeNode[] = [
      ...[...untracked].sort(sortByTopic).map(toFileNode),
      ...tracks.map(([, files]) => ({
        type: "folder" as const,
        name: files[0]?.trackTitle ?? files[0]?.track ?? "",
        children: [...files].sort(sortByTopic).map(toFileNode),
      })),
    ];

    return { type: "folder", name: group.roadmap, children };
  });
}

// ─── Components ───────────────────────────────────────────────────────────────

export function ContentSidebar() {
  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());
  const [newFileOpen, setNewFileOpen] = useState(false);

  const roadmapNames = data?.map((g) => g.roadmap) ?? [];
  const tree = data ? buildTree(data) : [];

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Content</span>
          <Button size="xs" variant="outline" onClick={() => setNewFileOpen(true)}>
            <FilePlus className="size-3" />
            New File
          </Button>
        </div>
      </SidebarHeader>

      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        roadmaps={roadmapNames}
      />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Files</SidebarGroupLabel>
          <SidebarGroupContent>
            {isLoading ? (
              <SidebarSkeleton />
            ) : (
              <SidebarMenu>
                {tree.map((node, i) => (
                  <Tree key={i} item={node} />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/admin/content/pending" />}>
              <GitPullRequest className="size-4" />
              Pending Changes
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </>
  );
}

/** Recursive tree node — dispatches to FileItem or FolderItem */
function Tree({ item }: { item: TreeNode }) {
  if (item.type === "file") return <FileItem item={item} />;
  return <FolderItem item={item} />;
}

function FileItem({ item }: { item: FileNode }) {
  const matchRoute = useMatchRoute();
  const isActive = !!matchRoute({
    to: "/admin/content/$roadmap/$slug",
    params: { roadmap: item.roadmap, slug: item.slug },
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <Link
            to="/admin/content/$roadmap/$slug"
            params={{ roadmap: item.roadmap, slug: item.slug }}
          />
        }
        isActive={isActive}
      >
        <File />
        <span>{item.name}</span>
      </SidebarMenuButton>
      {item.state === "pending_review" && (
        <SidebarMenuBadge className="text-amber-500">●</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

function FolderItem({ item }: { item: FolderNode }) {
  const [open, setOpen] = useState(item.defaultOpen ?? false);

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger render={<SidebarMenuButton />}>
          <ChevronRight
            className="transition-transform duration-200"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          />
          {open ? <FolderOpen /> : <Folder />}
          <span>{item.name}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {item.children.map((child, i) => (
              <Tree key={i} item={child} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-3 px-2 py-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-3.5 rounded" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="ml-5 space-y-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}
