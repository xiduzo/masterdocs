import { useRef, useState, useMemo } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masterdocs/ui/components/table";
import { File, FolderOpen, GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";

import { trpc, type RouterOutputs } from "@/utils/trpc";

export const Route = createFileRoute("/admin/roadmaps/$roadmap/")({
  component: RoadmapEditor,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function slugToTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Optimistic update helpers (previously in tree-utils)
type ContentList = RouterOutputs["content"]["list"];
type ContentGroup = ContentList[number];
type ContentFile = ContentGroup["files"][number];

function updateRoadmapFiles(
  groups: ContentList,
  roadmap: string,
  fn: (files: ContentFile[]) => ContentFile[],
): ContentList {
  return groups.map((g) => (g.roadmap === roadmap ? { ...g, files: fn(g.files) } : g));
}

function reorderTracks(files: ContentFile[], orderedTracks: string[]): ContentFile[] {
  return files.map((f) =>
    f.track ? { ...f, trackOrder: orderedTracks.indexOf(f.track) + 1 } : f,
  );
}

function reorderTrackFiles(files: ContentFile[], trackSlug: string, orderedSlugs: string[]): ContentFile[] {
  return files.map((f) => {
    if (f.track !== trackSlug || f.slug === "index") return f;
    const idx = orderedSlugs.indexOf(f.slug);
    return idx !== -1 ? { ...f, topicOrder: idx + 1 } : f;
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopicItem {
  slug: string;
  title: string;
  state: "published" | "pending_review";
  track: string;
}

interface TrackSection {
  slug: string;
  title: string;
  topics: TopicItem[];
}

// ─── Route component ──────────────────────────────────────────────────────────

function RoadmapEditor() {
  const { roadmap } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());
  const contentListQueryKey = trpc.content.list.queryKey();

  const reorderMutation = useMutation(trpc.content.reorder.mutationOptions());
  const createTrackMutation = useMutation(trpc.content.createTrack.mutationOptions());
  const createTopicMutation = useMutation(trpc.content.create.mutationOptions());

  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [addingTopicForTrack, setAddingTopicForTrack] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const roadmapData = useMemo(
    () => data?.find((r) => r.roadmap === roadmap),
    [data, roadmap],
  );

  const roadmapTitle = useMemo(() => {
    const indexFile = roadmapData?.files.find((f) => f.slug === "index");
    return indexFile?.title ?? slugToTitle(roadmap);
  }, [roadmapData, roadmap]);

  const tracks = useMemo<TrackSection[]>(() => {
    if (!roadmapData) return [];
    const trackMap = new Map<string, TrackSection>();
    for (const file of roadmapData.files) {
      if (!file.track) continue;
      if (!trackMap.has(file.track)) {
        trackMap.set(file.track, {
          slug: file.track,
          title: (file as typeof file & { trackTitle?: string }).trackTitle ?? slugToTitle(file.track),
          topics: [],
        });
      }
      if (file.slug !== "index") {
        trackMap.get(file.track)!.topics.push({
          slug: file.slug,
          title: file.title,
          state: file.state as "published" | "pending_review",
          track: file.track,
        });
      }
    }
    return [...trackMap.values()];
  }, [roadmapData]);

  const handleTrackDragStart = (event: DragStartEvent) => {
    setActiveTrackId(String(event.active.id));
  };

  const handleTrackDragEnd = async (event: DragEndEvent) => {
    setActiveTrackId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tracks.findIndex((t) => t.slug === active.id);
    const newIndex = tracks.findIndex((t) => t.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tracks, oldIndex, newIndex);
    const orderedTracks = reordered.map((t) => t.slug);
    const items = reordered.flatMap((track, i) =>
      track.topics.map((topic) => ({ slug: topic.slug, track: topic.track, trackOrder: i + 1 })),
    );

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previous = queryClient.getQueryData<ContentList>(contentListQueryKey);
    queryClient.setQueryData<ContentList>(contentListQueryKey, (groups) =>
      groups ? updateRoadmapFiles(groups, roadmap, (files) => reorderTracks(files, orderedTracks)) : groups,
    );

    reorderMutation.mutate(
      { roadmap, items },
      {
        onError: (err) => {
          if (previous) queryClient.setQueryData(contentListQueryKey, previous);
          toast.error(`Reorder failed: ${err.message}`);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: contentListQueryKey }),
      },
    );
  };

  const handleTopicDragEnd = async (track: TrackSection, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = track.topics.findIndex((t) => t.slug === active.id);
    const newIndex = track.topics.findIndex((t) => t.slug === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(track.topics, oldIndex, newIndex);
    const orderedSlugs = reordered.map((t) => t.slug);
    const items = reordered.map((topic, i) => ({ slug: topic.slug, track: topic.track, topicOrder: i + 1 }));

    await queryClient.cancelQueries({ queryKey: contentListQueryKey });
    const previous = queryClient.getQueryData<ContentList>(contentListQueryKey);
    queryClient.setQueryData<ContentList>(contentListQueryKey, (groups) =>
      groups
        ? updateRoadmapFiles(groups, roadmap, (files) => reorderTrackFiles(files, track.slug, orderedSlugs))
        : groups,
    );

    reorderMutation.mutate(
      { roadmap, items },
      {
        onError: (err) => {
          if (previous) queryClient.setQueryData(contentListQueryKey, previous);
          toast.error(`Reorder failed: ${err.message}`);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: contentListQueryKey }),
      },
    );
  };

  const handleCreateTrack = (title: string) => {
    const trackSlug = titleToSlug(title);
    createTrackMutation.mutate(
      { roadmap, trackSlug, trackTitle: title.trim() },
      {
        onSuccess: () => {
          toast.success("Track created");
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
          setIsAddingTrack(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleCreateTopic = (trackSlug: string, title: string) => {
    const slug = titleToSlug(title);
    createTopicMutation.mutate(
      { roadmap, slug, track: trackSlug },
      {
        onSuccess: () => {
          toast.success("Topic created");
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
          setAddingTopicForTrack(null);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const trackIds = tracks.map((t) => t.slug);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b">
              <span className="text-sm font-semibold">{roadmapTitle}</span>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="w-[60%]">Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracks.length > 0 && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleTrackDragStart}
                    onDragEnd={handleTrackDragEnd}
                  >
                    <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
                      {tracks.map((track) => (
                        <SortableTrackSection
                          key={track.slug}
                          track={track}
                          roadmap={roadmap}
                          sensors={sensors}
                          onTopicDragEnd={(e) => handleTopicDragEnd(track, e)}
                          isAddingTopic={addingTopicForTrack === track.slug}
                          onAddTopic={() => setAddingTopicForTrack(track.slug)}
                          onCancelAddTopic={() => setAddingTopicForTrack(null)}
                          onCreateTopic={(title) => handleCreateTopic(track.slug, title)}
                          isCreatingTopic={createTopicMutation.isPending}
                          isBeingDragged={activeTrackId === track.slug}
                        />
                      ))}
                    </SortableContext>
                    <DragOverlay dropAnimation={null}>
                      {activeTrackId ? (
                        <TrackDragOverlay
                          track={tracks.find((t) => t.slug === activeTrackId)!}
                        />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}

                {isAddingTrack ? (
                  <InlineInputRow
                    placeholder="Track title…"
                    isPending={createTrackMutation.isPending}
                    onSubmit={handleCreateTrack}
                    onCancel={() => setIsAddingTrack(false)}
                  />
                ) : (
                  <TableRow className="bg-muted/20 hover:bg-muted/30 border-t" onClick={() => setIsAddingTrack(true)}>
                    <TableCell />
                    <TableCell
                      colSpan={3}
                      className="py-2 text-xs text-muted-foreground/40 hover:text-muted-foreground cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Plus className="size-3" />
                        Add Track
                      </span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SortableTrackSection ─────────────────────────────────────────────────────

function SortableTrackSection({
  track,
  roadmap,
  sensors,
  onTopicDragEnd,
  isAddingTopic,
  onAddTopic,
  onCancelAddTopic,
  onCreateTopic,
  isCreatingTopic,
  isBeingDragged,
}: {
  track: TrackSection;
  roadmap: string;
  sensors: ReturnType<typeof useSensors>;
  onTopicDragEnd: (event: DragEndEvent) => void;
  isAddingTopic: boolean;
  onAddTopic: () => void;
  onCancelAddTopic: () => void;
  onCreateTopic: (title: string) => void;
  isCreatingTopic: boolean;
  isBeingDragged: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: track.slug,
  });

  // All rows in the section share this transform so the whole folder moves together
  // when displaced by another dragged track.
  const sectionStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const topicIds = track.topics.map((t) => t.slug);

  // Hide the entire section (header + topics + add row) while it's being dragged;
  // the DragOverlay card takes its place visually.
  const hiddenStyle = isBeingDragged ? { visibility: "hidden" as const } : undefined;

  return (
    <>
      {/* Track header row */}
      <TableRow
        ref={setNodeRef}
        style={{ ...sectionStyle, ...hiddenStyle }}
        className="bg-muted/20 hover:bg-muted/30 border-t group/track"
      >
        <TableCell className="py-3 pr-0 pl-2">
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground/30 opacity-0 group-hover/track:opacity-100 transition-opacity flex items-center"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        </TableCell>
        <TableCell className="font-medium py-3" colSpan={2}>
          <Link
            to="/admin/roadmaps/$roadmap/tracks/$track/$slug"
            params={{ roadmap, track: track.slug, slug: "index" }}
            className="flex items-center gap-2 hover:underline"
          >
            <FolderOpen className="size-4 text-blue-500 shrink-0" />
            {track.title}
          </Link>
        </TableCell>
        <TableCell />
      </TableRow>

      {/* Topic rows (sortable) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onTopicDragEnd}
      >
        <SortableContext items={topicIds} strategy={verticalListSortingStrategy}>
          {track.topics.map((topic) => (
            <SortableTopicRow
              key={topic.slug}
              topic={topic}
              roadmap={roadmap}
              hidden={isBeingDragged}
              parentTransform={transform}
              parentTransition={transition}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add topic */}
      {isAddingTopic ? (
        <InlineInputRow
          placeholder="Topic title…"
          indent
          isPending={isCreatingTopic}
          onSubmit={onCreateTopic}
          onCancel={onCancelAddTopic}
        />
      ) : (
        <TableRow style={{ ...sectionStyle, ...hiddenStyle }} className="hover:bg-transparent" onClick={onAddTopic}>
          <TableCell />
          <TableCell
            colSpan={3}
            className="py-2 pl-8 text-xs text-muted-foreground/40 hover:text-muted-foreground cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="size-3" />
              Add Topic to {track.title}
            </span>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── SortableTopicRow ─────────────────────────────────────────────────────────

function SortableTopicRow({
  topic,
  roadmap,
  hidden = false,
  parentTransform,
  parentTransition,
}: {
  topic: TopicItem;
  roadmap: string;
  hidden?: boolean;
  parentTransform?: Parameters<typeof CSS.Transform.toString>[0] | null;
  parentTransition?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: topic.slug,
  });

  // Use own transform when being dragged within a track; otherwise inherit the
  // parent track's transform so the whole folder section slides as one unit.
  const activeTransform = transform ?? parentTransform ?? null;
  const activeTransition = transition ?? parentTransition;

  const style = {
    transform: CSS.Transform.toString(activeTransform),
    transition: activeTransition,
    opacity: isDragging ? 0.4 : undefined,
    visibility: hidden ? ("hidden" as const) : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="hover:bg-muted/20 group/topic">
      <TableCell className="py-2.5 pr-0 pl-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground/30 opacity-0 group-hover/topic:opacity-100 transition-opacity flex items-center"
          onClick={(e) => e.preventDefault()}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-3" />
        </button>
      </TableCell>
      <TableCell className="py-2.5 pl-8">
        <Link
          to="/admin/roadmaps/$roadmap/tracks/$track/$slug"
          params={{ roadmap, track: topic.track, slug: topic.slug }}
          className="flex items-center gap-2 hover:underline text-sm"
        >
          <File className="size-3.5 text-muted-foreground/50 shrink-0" />
          {topic.title}
        </Link>
      </TableCell>
      <TableCell className="py-2.5">
        {topic.state === "pending_review" ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
            Pending Review
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            Published
          </span>
        )}
      </TableCell>
      <TableCell />
    </TableRow>
  );
}

// ─── TrackDragOverlay ─────────────────────────────────────────────────────────

function TrackDragOverlay({ track }: { track: TrackSection }) {
  return (
    <div className="rounded-lg border bg-background shadow-lg overflow-hidden w-[480px] opacity-95">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
        <GripVertical className="size-3.5 text-muted-foreground/40" />
        <FolderOpen className="size-4 text-blue-500 shrink-0" />
        <span className="text-sm font-medium">{track.title}</span>
        <span className="ml-auto text-xs text-muted-foreground/50">
          {track.topics.length} {track.topics.length === 1 ? "topic" : "topics"}
        </span>
      </div>
      {track.topics.slice(0, 4).map((topic) => (
        <div key={topic.slug} className="flex items-center gap-2 px-4 py-2 pl-10 border-b last:border-0">
          <File className="size-3.5 text-muted-foreground/40 shrink-0" />
          <span className="text-sm text-muted-foreground truncate">{topic.title}</span>
        </div>
      ))}
      {track.topics.length > 4 && (
        <div className="px-4 py-2 pl-10 text-xs text-muted-foreground/40">
          +{track.topics.length - 4} more…
        </div>
      )}
    </div>
  );
}

// ─── InlineInputRow ───────────────────────────────────────────────────────────

function InlineInputRow({
  placeholder,
  indent = false,
  isPending,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  indent?: boolean;
  isPending: boolean;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const slug = titleToSlug(value);
  const canSubmit = slug.length > 0 && SLUG_PATTERN.test(slug) && !isPending;

  return (
    <TableRow>
      <TableCell />
      <TableCell colSpan={3} className={indent ? "pl-8 py-2" : "py-2"}>
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) onSubmit(value);
            if (e.key === "Escape") onCancel();
          }}
          onBlur={() => { if (!value && !isPending) onCancel(); }}
          placeholder={placeholder}
          disabled={isPending}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 disabled:opacity-50"
        />
      </TableCell>
    </TableRow>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="divide-y">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-4 py-2.5 pl-14">
                  <Skeleton className="size-3.5 rounded" />
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-4 w-16 ml-auto rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
