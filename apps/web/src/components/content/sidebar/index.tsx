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
import { Link, useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, Ellipsis, File, Folder, FolderOpen, FolderPlus, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { NavUser } from "@/components/content/nav-user";
import { trpc } from "@/utils/trpc";

import { InlineCreateInput, InlineCreateRoadmap, InlineCreateTrack } from "./inline-create";
import {
  applyOptimisticContentListUpdate,
  buildTree,
  contentListQueryKey,
  hasPendingDescendant,
  removeFileFromGroups,
  removeRoadmapFromGroups,
  removeTrackFromGroups,
  reorderRoadmapLevelFiles,
  reorderTracks,
  reorderTrackFiles,
  updateRoadmapFiles,
  type FileNode,
  type FolderNode,
  type TreeNode,
} from "./tree-utils";

// ─── ContentSidebar ───────────────────────────────────────────────────────────

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

// ─── Tree dispatcher ──────────────────────────────────────────────────────────

function Tree({ item, isRoadmapLevel = false }: { item: TreeNode; isRoadmapLevel?: boolean }) {
  if (item.type === "file") return <FileItem item={item} />;
  return <FolderItem item={item} isRoadmapLevel={isRoadmapLevel} />;
}

// ─── FileItem ─────────────────────────────────────────────────────────────────

function FileItem({ item }: { item: FileNode }) {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteFileMutation = useMutation(trpc.content.deleteFile.mutationOptions());
  const hasTrack = !!item.track;
  const isActive = hasTrack
    ? !!matchRoute({
        to: "/admin/content/$roadmap/$track/$slug",
        params: { roadmap: item.roadmap, track: item.track!, slug: item.slug },
      })
    : !!matchRoute({
        to: "/admin/content/$roadmap/$slug",
        params: { roadmap: item.roadmap, slug: item.slug },
      });

  const linkProps = hasTrack
    ? {
        to: "/admin/content/$roadmap/$track/$slug" as const,
        params: { roadmap: item.roadmap, track: item.track!, slug: item.slug },
      }
    : {
        to: "/admin/content/$roadmap/$slug" as const,
        params: { roadmap: item.roadmap, slug: item.slug },
      };

  const canDelete = item.slug !== "index";

  const handleDeleteFile = async () => {
    if (!canDelete || deleteFileMutation.isPending) return;

    const displayPath = item.track
      ? `${item.roadmap}/${item.track}/${item.slug}`
      : `${item.roadmap}/${item.slug}`;

    const confirmed = window.confirm(`Delete file "${displayPath}"? This cannot be undone.`);
    if (!confirmed) return;

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousGroups = applyOptimisticContentListUpdate(queryClient, (groups) =>
      removeFileFromGroups(groups, item.roadmap, item.slug, item.track),
    );

    deleteFileMutation.mutate(
      { roadmap: item.roadmap, track: item.track, slug: item.slug },
      {
        onSuccess: () => {
          toast.success("File deleted");
          if (isActive) {
            navigate({ to: "/admin/content" });
          }
        },
        onError: (err) => {
          if (previousGroups) {
            queryClient.setQueryData(contentListQueryKey, previousGroups);
          }
          toast.error(err.message);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
        },
      },
    );
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link {...linkProps} />}
        isActive={isActive}
      >
        <File />
        <span>{item.name}</span>
      </SidebarMenuButton>
      {item.state === "pending_review" && (
        <SidebarMenuBadge className="text-amber-500!">●</SidebarMenuBadge>
      )}
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction
                title="File actions"
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem
                onClick={handleDeleteFile}
                disabled={deleteFileMutation.isPending}
                className="text-red-600 focus:text-red-700"
              >
                <Trash2 className="size-4" />
                Delete file
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );
}

// ─── SortableFileItem ─────────────────────────────────────────────────────────

function SortableFileItem({ item }: { item: FileNode }) {
  const isIndex = item.slug === "index";
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.slug, disabled: isIndex });

  const matchRoute = useMatchRoute();
  const hasTrack = !!item.track;
  const isActive = hasTrack
    ? !!matchRoute({
        to: "/admin/content/$roadmap/$track/$slug",
        params: { roadmap: item.roadmap, track: item.track!, slug: item.slug },
      })
    : !!matchRoute({
        to: "/admin/content/$roadmap/$slug",
        params: { roadmap: item.roadmap, slug: item.slug },
      });

  const linkProps = hasTrack
    ? {
        to: "/admin/content/$roadmap/$track/$slug" as const,
        params: { roadmap: item.roadmap, track: item.track!, slug: item.slug },
      }
    : {
        to: "/admin/content/$roadmap/$slug" as const,
        params: { roadmap: item.roadmap, slug: item.slug },
      };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <SidebarMenuItem ref={setNodeRef} style={style}>
      <div className="group/sortable-file flex items-center">
        {!isIndex && (
          <button
            type="button"
            className="flex shrink-0 cursor-grab touch-none items-center px-0.5 text-sidebar-foreground/30 opacity-0 transition-opacity group-hover/sortable-file:opacity-100"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3" />
          </button>
        )}
        <SidebarMenuButton
          className="flex-1"
          render={<Link {...linkProps} />}
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

// ─── SortableTrackFolder ──────────────────────────────────────────────────────

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

// ─── TrackFolder ──────────────────────────────────────────────────────────────

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
  const { roadmap: activeRoadmap, track: activeTrack } = useParams({ strict: false }) as { roadmap?: string; track?: string };
  const isChildActive = item.roadmap === activeRoadmap && item.track === activeTrack;
  const [open, setOpen] = useState(isChildActive);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const hasPending = item.children.some(hasPendingDescendant);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reorderMutation = useMutation(trpc.content.reorder.mutationOptions());
  const deleteTrackMutation = useMutation(trpc.content.deleteTrack.mutationOptions());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fileChildren = item.children.filter((c): c is FileNode => c.type === "file");
  const indexFile = fileChildren.find((f) => f.slug === "index");
  const sortableFileChildren = fileChildren.filter((f) => f.slug !== "index");
  const fileIds = sortableFileChildren.map((f) => f.slug);

  const handleFileDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableFileChildren.findIndex((f) => f.slug === active.id);
    const newIndex = sortableFileChildren.findIndex((f) => f.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortableFileChildren, oldIndex, newIndex);
    const items = reordered.map((f, i) => ({
      slug: f.slug,
      track: f.track,
      topicOrder: i + 1,
    }));

    const orderedSlugs = reordered.map((file) => file.slug);
    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousGroups = applyOptimisticContentListUpdate(queryClient, (groups) =>
      updateRoadmapFiles(groups, roadmapName, (files) =>
        reorderTrackFiles(files, item.track ?? item.name, orderedSlugs),
      ),
    );

    reorderMutation.mutate(
      { roadmap: roadmapName, items },
      {
        onError: (err) => {
          if (previousGroups) {
            queryClient.setQueryData(contentListQueryKey, previousGroups);
          }
          toast.error(`Reorder failed: ${err.message}`);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
        },
      },
    );
  };

  const handleAddFile = () => {
    setOpen(true);
    setIsCreatingFile(true);
  };

  const handleDeleteTrack = async () => {
    const trackToDelete = item.track ?? fileChildren[0]?.track;
    if (!trackToDelete || deleteTrackMutation.isPending) return;

    const confirmed = window.confirm(
      `Delete track "${item.name}" and all files inside it? This cannot be undone.`,
    );
    if (!confirmed) return;

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousGroups = applyOptimisticContentListUpdate(queryClient, (groups) =>
      removeTrackFromGroups(groups, roadmapName, trackToDelete),
    );

    deleteTrackMutation.mutate(
      { roadmap: roadmapName, track: trackToDelete },
      {
        onSuccess: () => {
          toast.success("Track deleted");
          if (isChildActive) {
            navigate({ to: "/admin/content" });
          }
        },
        onError: (err) => {
          if (previousGroups) {
            queryClient.setQueryData(contentListQueryKey, previousGroups);
          }
          toast.error(err.message);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
        },
      },
    );
  };

  const trackSlug = item.track ?? fileChildren[0]?.track;

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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction
                  title="Track actions"
                  className="right-7 opacity-0 group-hover/folder-row:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem
                  onClick={handleDeleteTrack}
                  disabled={deleteTrackMutation.isPending}
                  className="text-red-600 focus:text-red-700"
                >
                  <Trash2 className="size-4" />
                  Delete track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub className={cn(dragListeners && "ml-8", "mr-0 pr-0")}>
            {indexFile && <FileItem item={indexFile} />}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFileDragEnd}
            >
              <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
                {sortableFileChildren.map((child) => (
                  <SortableFileItem key={child.slug} item={child} />
                ))}
              </SortableContext>
            </DndContext>
            {isCreatingFile && (
              <InlineCreateInput
                roadmap={roadmapName}
                track={trackSlug}
                onDone={() => setIsCreatingFile(false)}
              />
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

// ─── RoadmapFolder ────────────────────────────────────────────────────────────

function RoadmapFolder({ item }: { item: FolderNode }) {
  const { roadmap: activeRoadmap } = useParams({ strict: false }) as { roadmap?: string };
  const isChildActive = item.roadmap === activeRoadmap;
  const [open, setOpen] = useState(isChildActive);
  const [isCreatingTrack, setIsCreatingTrack] = useState(false);
  const hasPending = item.children.some(hasPendingDescendant);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reorderMutation = useMutation(trpc.content.reorder.mutationOptions());
  const deleteRoadmapMutation = useMutation(trpc.content.deleteRoadmap.mutationOptions());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const roadmapName = item.roadmap ?? item.name;
  const fileChildren = item.children.filter((c): c is FileNode => c.type === "file");
  const indexFile = fileChildren.find((f) => f.slug === "index");
  const sortableFileChildren = fileChildren.filter((f) => f.slug !== "index");
  const trackChildren = item.children.filter((c): c is FolderNode => c.type === "folder");
  const fileIds = sortableFileChildren.map((f) => f.slug);
  const trackIds = trackChildren.map((t) => t.track ?? t.name);

  const handleFileDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableFileChildren.findIndex((f) => f.slug === active.id);
    const newIndex = sortableFileChildren.findIndex((f) => f.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortableFileChildren, oldIndex, newIndex);
    const items = reordered.map((f, i) => ({
      slug: f.slug,
      track: f.track,
      topicOrder: i + 1,
    }));

    const orderedSlugs = reordered.map((file) => file.slug);
    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousGroups = applyOptimisticContentListUpdate(queryClient, (groups) =>
      updateRoadmapFiles(groups, roadmapName, (files) =>
        reorderRoadmapLevelFiles(files, orderedSlugs),
      ),
    );

    reorderMutation.mutate(
      { roadmap: roadmapName, items },
      {
        onError: (err) => {
          if (previousGroups) {
            queryClient.setQueryData(contentListQueryKey, previousGroups);
          }
          toast.error(`Reorder failed: ${err.message}`);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
        },
      },
    );
  };

  const handleTrackDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = trackChildren.findIndex((t) => (t.track ?? t.name) === active.id);
    const newIndex = trackChildren.findIndex((t) => (t.track ?? t.name) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(trackChildren, oldIndex, newIndex);
    const items = reordered.flatMap((track, i) => {
      const files = track.children.filter((c): c is FileNode => c.type === "file");
      return files.map((f) => ({
        slug: f.slug,
        track: f.track,
        trackOrder: i + 1,
      }));
    });

    const orderedTracks = reordered.map((track) => track.track ?? track.name);
    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousGroups = applyOptimisticContentListUpdate(queryClient, (groups) =>
      updateRoadmapFiles(groups, roadmapName, (files) => reorderTracks(files, orderedTracks)),
    );

    reorderMutation.mutate(
      { roadmap: roadmapName, items },
      {
        onError: (err) => {
          if (previousGroups) {
            queryClient.setQueryData(contentListQueryKey, previousGroups);
          }
          toast.error(`Reorder failed: ${err.message}`);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
        },
      },
    );
  };

  const handleAddTrack = () => {
    setOpen(true);
    setIsCreatingTrack(true);
  };

  const handleDeleteRoadmap = async () => {
    if (deleteRoadmapMutation.isPending) return;

    const confirmed = window.confirm(
      `Delete roadmap "${roadmapName}" and everything inside it? This cannot be undone.`,
    );
    if (!confirmed) return;

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previousGroups = applyOptimisticContentListUpdate(queryClient, (groups) =>
      removeRoadmapFromGroups(groups, roadmapName),
    );

    deleteRoadmapMutation.mutate(
      { roadmap: roadmapName },
      {
        onSuccess: () => {
          toast.success("Roadmap deleted");
          if (isChildActive) {
            navigate({ to: "/admin/content" });
          }
        },
        onError: (err) => {
          if (previousGroups) {
            queryClient.setQueryData(contentListQueryKey, previousGroups);
          }
          toast.error(err.message);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
        },
      },
    );
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
                <DropdownMenuItem onClick={handleAddTrack}>
                  <FolderPlus className="size-4" />
                  Track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction
                  title="Roadmap actions"
                  className="right-7 opacity-0 group-hover/folder-row:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem
                  onClick={handleDeleteRoadmap}
                  disabled={deleteRoadmapMutation.isPending}
                  className="text-red-600 focus:text-red-700"
                >
                  <Trash2 className="size-4" />
                  Delete roadmap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {indexFile && <FileItem item={indexFile} />}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFileDragEnd}
            >
              <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
                {sortableFileChildren.map((child) => (
                  <SortableFileItem key={child.slug} item={child} />
                ))}
              </SortableContext>
            </DndContext>
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

// ─── FolderItem ───────────────────────────────────────────────────────────────

function FolderItem({ item, isRoadmapLevel = false }: { item: FolderNode; isRoadmapLevel?: boolean }) {
  if (isRoadmapLevel) {
    return <RoadmapFolder item={item} />;
  }
  return <TrackFolder item={item} roadmapName={item.roadmap ?? item.name} />;
}

// ─── SidebarSkeleton ──────────────────────────────────────────────────────────

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
