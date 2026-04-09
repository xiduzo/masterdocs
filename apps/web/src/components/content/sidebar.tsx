import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@masterdocs/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@masterdocs/ui/components/dropdown-menu";
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
} from "@masterdocs/ui/components/sidebar";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import { cn } from "@masterdocs/ui/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { DraggableAttributes } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, File, Folder, FolderOpen, FolderPlus, GripVertical, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { NavUser } from "@/components/content/nav-user";
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
  track?: string;
  trackTitle?: string;
  trackOrder?: number;
  topicOrder?: number;
};

type FolderNode = {
  type: "folder";
  name: string;
  defaultOpen?: boolean;
  children: TreeNode[];
  roadmap?: string;
  track?: string;
  trackTitle?: string;
};

type TreeNode = FileNode | FolderNode;

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function hasPendingDescendant(node: TreeNode): boolean {
  if (node.type === "file") return node.state === "pending_review";
  return node.children.some(hasPendingDescendant);
}

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
      track: file.track,
      trackTitle: file.trackTitle,
      trackOrder: file.trackOrder,
      topicOrder: file.topicOrder,
    });

    const children: TreeNode[] = [
      ...[...untracked].sort(sortByTopic).map(toFileNode),
      ...tracks.map(([trackSlug, files]) => ({
        type: "folder" as const,
        name: files[0]?.trackTitle ?? files[0]?.track ?? "",
        children: [...files].sort(sortByTopic).map(toFileNode),
        roadmap: group.roadmap,
        track: trackSlug,
        trackTitle: files[0]?.trackTitle ?? trackSlug,
      })),
    ];

    return { type: "folder", name: group.roadmap, children, roadmap: group.roadmap };
  });
}

// ─── Inline create input ──────────────────────────────────────────────────────

function InlineCreateInput({
  roadmap,
  track,
  trackTitle,
  trackOrder,
  nextTopicOrder,
  onDone,
}: {
  roadmap: string;
  track?: string;
  trackTitle?: string;
  trackOrder?: number;
  nextTopicOrder?: number;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation(trpc.content.create.mutationOptions());

  const slug = titleToSlug(title);
  const canSubmit = slug.length > 0 && SLUG_PATTERN.test(slug) && !createMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      { roadmap, slug, track, trackTitle, trackOrder, topicOrder: nextTopicOrder },
      {
        onSuccess: () => {
          toast.success("File created");
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
          onDone();
          navigate({
            to: "/admin/content/$roadmap/$slug",
            params: { roadmap, slug },
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onDone();
          }}
          onBlur={() => {
            if (!title && !createMutation.isPending) onDone();
          }}
          placeholder="section name"
          disabled={createMutation.isPending}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-sidebar-foreground/40 disabled:opacity-50"
        />
      </div>
    </SidebarMenuItem>
  );
}

// ─── Inline create: new roadmap ───────────────────────────────────────────────

function InlineCreateRoadmap({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation(trpc.content.createRoadmap.mutationOptions());

  const slug = titleToSlug(title);
  const canSubmit = slug.length > 0 && SLUG_PATTERN.test(slug) && title.trim().length > 0 && !createMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      { slug, title: title.trim() },
      {
        onSuccess: () => {
          toast.success("Roadmap created");
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
          onDone();
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
        <Folder className="size-4 shrink-0 text-sidebar-foreground/40" />
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onDone();
          }}
          onBlur={() => {
            if (!title && !createMutation.isPending) onDone();
          }}
          placeholder="Roadmap title"
          disabled={createMutation.isPending}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-sidebar-foreground/40 disabled:opacity-50"
        />
      </div>
    </SidebarMenuItem>
  );
}

// ─── Inline create: new track ─────────────────────────────────────────────────

function InlineCreateTrack({
  roadmap,
  onDone,
}: {
  roadmap: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation(trpc.content.createTrack.mutationOptions());

  const trackSlug = titleToSlug(title);
  const canSubmit = trackSlug.length > 0 && SLUG_PATTERN.test(trackSlug) && title.trim().length > 0 && !createMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      { roadmap, trackSlug, trackTitle: title.trim() },
      {
        onSuccess: () => {
          toast.success("Sub-section created");
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
          onDone();
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
        <FolderPlus className="size-4 shrink-0 text-sidebar-foreground/40" />
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onDone();
          }}
          onBlur={() => {
            if (!title && !createMutation.isPending) onDone();
          }}
          placeholder="Track title"
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
  const tree = data ? buildTree(data) : [];
  const [isCreatingRoadmap, setIsCreatingRoadmap] = useState(false);

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Content</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="group/roadmaps-label relative flex items-center">
            <SidebarGroupLabel className="flex-1">Roadmaps</SidebarGroupLabel>
            <button
              onClick={() => setIsCreatingRoadmap(true)}
              title="New roadmap"
              className="mr-2 rounded-md p-0.5 text-sidebar-foreground/50 opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/roadmaps-label:opacity-100"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <SidebarGroupContent>
            {isLoading ? (
              <SidebarSkeleton />
            ) : (
              <SidebarMenu>
                {tree.map((node, i) => (
                  <Tree key={i} item={node} isRoadmapLevel />
                ))}
                {isCreatingRoadmap && (
                  <InlineCreateRoadmap onDone={() => setIsCreatingRoadmap(false)} />
                )}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </>
  );
}

/** Recursive tree node — dispatches to FileItem or FolderItem */
function Tree({ item, isRoadmapLevel = false }: { item: TreeNode; isRoadmapLevel?: boolean }) {
  if (item.type === "file") return <FileItem item={item} />;
  return <FolderItem item={item} isRoadmapLevel={isRoadmapLevel} />;
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
        <SidebarMenuBadge className="text-amber-500!">●</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/** Sortable wrapper for a file item inside a track folder */
function SortableFileItem({ item }: { item: FileNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.slug });

  const matchRoute = useMatchRoute();
  const isActive = !!matchRoute({
    to: "/admin/content/$roadmap/$slug",
    params: { roadmap: item.roadmap, slug: item.slug },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <SidebarMenuItem ref={setNodeRef} style={style}>
      <div className="group/sortable-file flex items-center">
        <button
          type="button"
          className="flex shrink-0 cursor-grab touch-none items-center px-0.5 text-sidebar-foreground/30 opacity-0 transition-opacity group-hover/sortable-file:opacity-100"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-3" />
        </button>
        <SidebarMenuButton
          className="flex-1"
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
      </div>
      {item.state === "pending_review" && (
        <SidebarMenuBadge className="top-1.5 z-10 text-amber-500!">●</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/** Sortable wrapper for a track folder inside a roadmap */
function SortableTrackFolder({ item, roadmapName }: { item: FolderNode; roadmapName: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.track ?? item.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TrackFolder
        item={item}
        roadmapName={roadmapName}
        dragListeners={listeners}
        dragAttributes={attributes}
      />
    </div>
  );
}

/** A track folder with sortable files inside */
function TrackFolder({
  item,
  roadmapName,
  dragListeners,
  dragAttributes,
}: {
  item: FolderNode;
  roadmapName: string;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: DraggableAttributes;
}) {
  const [open, setOpen] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const hasPending = item.children.some(hasPendingDescendant);
  const queryClient = useQueryClient();
  const reorderMutation = useMutation(trpc.content.reorder.mutationOptions());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fileChildren = item.children.filter((c): c is FileNode => c.type === "file");
  const fileIds = fileChildren.map((f) => f.slug);

  const handleFileDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fileChildren.findIndex((f) => f.slug === active.id);
    const newIndex = fileChildren.findIndex((f) => f.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(fileChildren, oldIndex, newIndex);
    const items = reordered.map((f, i) => ({
      slug: f.slug,
      topicOrder: i + 1,
    }));

    reorderMutation.mutate(
      { roadmap: roadmapName, items },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
        },
        onError: (err) => toast.error(`Reorder failed: ${err.message}`),
      },
    );
  };

  const handleAddFile = () => {
    setOpen(true);
    setIsCreatingFile(true);
  };

  // Get track info from the first file child
  const firstFile = fileChildren[0];
  const trackInfo = {
    track: item.track ?? firstFile?.track,
    trackTitle: item.trackTitle ?? firstFile?.trackTitle,
    trackOrder: firstFile?.trackOrder,
  };

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group/folder-row relative">
          <div className="group/sortable-folder flex items-center">
            {dragListeners && (
              <button
                type="button"
                className="flex shrink-0 cursor-grab touch-none items-center px-0.5 text-sidebar-foreground/30 opacity-0 transition-opacity group-hover/sortable-folder:opacity-100"
                {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
                {...(dragAttributes as React.HTMLAttributes<HTMLButtonElement>)}
              >
                <GripVertical className="size-3" />
              </button>
            )}
            <CollapsibleTrigger render={<SidebarMenuButton className="flex-1" />}>
              <ChevronRight
                className="transition-transform duration-200"
                style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
              />
              {open ? <FolderOpen /> : <Folder />}
              <span>{item.name}</span>
            </CollapsibleTrigger>
          </div>
          {hasPending && (
            <SidebarMenuBadge className="top-1.5 text-amber-500! group-hover/folder-row:opacity-0">
              ●
            </SidebarMenuBadge>
          )}
          <SidebarMenuAction
            onClick={(e) => {
              e.stopPropagation();
              handleAddFile();
            }}
            title="New file"
            className="opacity-0 group-hover/folder-row:opacity-100"
          >
            <Plus />
          </SidebarMenuAction>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub className={cn(dragListeners && "ml-8", "mr-0 pr-0")}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFileDragEnd}
            >
              <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
                {fileChildren.map((child) => (
                  <SortableFileItem key={child.slug} item={child} />
                ))}
              </SortableContext>
            </DndContext>
            {isCreatingFile && (
              <InlineCreateInput
                roadmap={roadmapName}
                track={trackInfo.track}
                trackTitle={trackInfo.trackTitle}
                trackOrder={trackInfo.trackOrder}
                nextTopicOrder={fileChildren.length + 1}
                onDone={() => setIsCreatingFile(false)}
              />
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function RoadmapFolder({ item }: { item: FolderNode }) {
  const [open, setOpen] = useState(item.defaultOpen ?? false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingTrack, setIsCreatingTrack] = useState(false);
  const hasPending = item.children.some(hasPendingDescendant);
  const queryClient = useQueryClient();
  const reorderMutation = useMutation(trpc.content.reorder.mutationOptions());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const roadmapName = item.roadmap ?? item.name;
  const fileChildren = item.children.filter((c): c is FileNode => c.type === "file");
  const trackChildren = item.children.filter((c): c is FolderNode => c.type === "folder");
  const fileIds = fileChildren.map((f) => f.slug);
  const trackIds = trackChildren.map((t) => t.track ?? t.name);

  const handleFileDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fileChildren.findIndex((f) => f.slug === active.id);
    const newIndex = fileChildren.findIndex((f) => f.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(fileChildren, oldIndex, newIndex);
    const items = reordered.map((f, i) => ({
      slug: f.slug,
      topicOrder: i + 1,
    }));

    reorderMutation.mutate(
      { roadmap: roadmapName, items },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
        },
        onError: (err) => toast.error(`Reorder failed: ${err.message}`),
      },
    );
  };

  const handleTrackDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = trackChildren.findIndex((t) => (t.track ?? t.name) === active.id);
    const newIndex = trackChildren.findIndex((t) => (t.track ?? t.name) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(trackChildren, oldIndex, newIndex);
    // Update trackOrder for first file of each track
    const items = reordered.flatMap((track, i) => {
      const files = track.children.filter((c): c is FileNode => c.type === "file");
      return files.map((f) => ({
        slug: f.slug,
        trackOrder: i + 1,
      }));
    });

    reorderMutation.mutate(
      { roadmap: roadmapName, items },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [["content", "list"]] });
        },
        onError: (err) => toast.error(`Reorder failed: ${err.message}`),
      },
    );
  };

  const handleAddFile = () => {
    setOpen(true);
    setIsCreatingFile(true);
  };

  const handleAddTrack = () => {
    setOpen(true);
    setIsCreatingTrack(true);
  };

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group/folder-row relative">
          <CollapsibleTrigger render={<SidebarMenuButton />}>
            <ChevronRight
              className="transition-transform duration-200"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            />
            {open ? <FolderOpen /> : <Folder />}
            <span>{item.name}</span>
          </CollapsibleTrigger>
          {hasPending && (
            <SidebarMenuBadge className="top-1.5 text-amber-500! group-hover/folder-row:opacity-0">
              ●
            </SidebarMenuBadge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction
                  title="Add to roadmap"
                  className="opacity-0 group-hover/folder-row:opacity-100"
                />
              }
            >
              <Plus />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem onClick={handleAddFile}>
                  <File className="size-4" />
                  Section
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddTrack}>
                  <FolderPlus className="size-4" />
                  Track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {/* Untracked files — drag to reorder */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFileDragEnd}
            >
              <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
                {fileChildren.map((child) => (
                  <SortableFileItem key={child.slug} item={child} />
                ))}
              </SortableContext>
            </DndContext>
            {/* Track folders — drag to reorder */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTrackDragEnd}
            >
              <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
                {trackChildren.map((child) => (
                  <SortableTrackFolder
                    key={child.track ?? child.name}
                    item={child}
                    roadmapName={roadmapName}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {isCreatingFile && (
              <InlineCreateInput
                roadmap={roadmapName}
                onDone={() => setIsCreatingFile(false)}
              />
            )}
            {isCreatingTrack && (
              <InlineCreateTrack
                roadmap={roadmapName}
                onDone={() => setIsCreatingTrack(false)}
              />
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function FolderItem({ item, isRoadmapLevel = false }: { item: FolderNode; isRoadmapLevel?: boolean }) {
  if (isRoadmapLevel) {
    return <RoadmapFolder item={item} />;
  }
  // Non-roadmap, non-track folders fallback (shouldn't happen with current tree structure)
  return <TrackFolder item={item} roadmapName={item.roadmap ?? item.name} />;
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
