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
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@fumadocs-learning/ui/components/sidebar";
import { Skeleton } from "@fumadocs-learning/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ClockAlert, File, Folder, FolderOpen, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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

const SLUG_PATTERN = /^[a-z0-9-]+$/;

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

// ─── Inline create input ──────────────────────────────────────────────────────

function InlineCreateInput({
  roadmap,
  onDone,
}: {
  roadmap: string;
  onDone: () => void;
}) {
  const [slug, setSlug] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation(trpc.content.create.mutationOptions());

  const slugValid = slug.length > 0 && SLUG_PATTERN.test(slug);

  const handleSubmit = () => {
    if (!slugValid || createMutation.isPending) return;
    const trimmed = slug.trim();
    createMutation.mutate(
      { roadmap, slug: trimmed },
      {
        onSuccess: () => {
          toast.success("File created");
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
          onDone();
          navigate({
            to: "/admin/content/$roadmap/$slug",
            params: { roadmap, slug: trimmed },
          });
        },
        onError: (err) => {
          toast.error(err.message);
          inputRef.current?.focus();
        },
      },
    );
  };

  return (
    <SidebarMenuItem>
      <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm">
        <File className="size-4 shrink-0 text-sidebar-foreground/40" />
        <input
          ref={inputRef}
          autoFocus
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onDone();
          }}
          onBlur={() => {
            if (!slug && !createMutation.isPending) onDone();
          }}
          placeholder="page-name"
          disabled={createMutation.isPending}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-sidebar-foreground/40 disabled:opacity-50"
        />
      </div>
    </SidebarMenuItem>
  );
}

// ─── Components ───────────────────────────────────────────────────────────────

export function ContentSidebar() {
  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());
  const { data: pending } = useQuery(trpc.content.listPending.queryOptions());
  const tree = data ? buildTree(data) : [];

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Content</span>
        </div>
      </SidebarHeader>

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
              <ClockAlert className="size-4" />
              Pending Changes
            </SidebarMenuButton>
            {!!pending?.length && (
              <SidebarMenuBadge>{pending.length}</SidebarMenuBadge>
            )}
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
  const [isCreating, setIsCreating] = useState(false);

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    setIsCreating(true);
  };

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Wrapper scoped to just this row so hover doesn't bleed into children */}
        <div className="group/folder-row relative">
          <CollapsibleTrigger render={<SidebarMenuButton />}>
            <ChevronRight
              className="transition-transform duration-200"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            />
            {open ? <FolderOpen /> : <Folder />}
            <span>{item.name}</span>
          </CollapsibleTrigger>
          <SidebarMenuAction
            onClick={handleAddClick}
            title="New file"
            className="opacity-0 group-hover/folder-row:opacity-100"
          >
            <Plus />
          </SidebarMenuAction>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {item.children.map((child, i) => (
              <Tree key={i} item={child} />
            ))}
            {isCreating && (
              <InlineCreateInput
                roadmap={item.name}
                onDone={() => setIsCreating(false)}
              />
            )}
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
