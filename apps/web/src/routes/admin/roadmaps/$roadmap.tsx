import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@masterdocs/ui/components/badge";
import { Button } from "@masterdocs/ui/components/button";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import { cn } from "@masterdocs/ui/lib/utils";
import {
  ChevronRight,
  ExternalLink,
  Eye,
  File,
  Folder,
  FolderOpen,
  GripVertical,
  Plus,
  Save,
  X,
} from "lucide-react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/admin/roadmaps/$roadmap")({
  component: RoadmapEditor,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopicNode {
  slug: string;
  title: string;
  state: "published" | "pending_review";
  track: string;
  trackTitle: string;
}

interface TrackNode {
  slug: string;
  title: string;
  topics: TopicNode[];
}

type SelectedNode =
  | { type: "track"; slug: string }
  | { type: "topic"; trackSlug: string; topicSlug: string };

function slugToTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;
const SKILL_SUGGESTIONS = ["JavaScript", "TypeScript", "React", "CSS", "HTML", "Python", "Rust", "Go", "C++", "Breadboarding", "Electronics"];

// ─── Route component ──────────────────────────────────────────────────────────

function RoadmapEditor() {
  const { roadmap } = Route.useParams();
  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());

  const [openTracks, setOpenTracks] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  // ── Derived hierarchy ────────────────────────────────────────────────────

  const roadmapData = useMemo(
    () => data?.find((r) => r.roadmap === roadmap),
    [data, roadmap],
  );

  const roadmapTitle = useMemo(() => {
    const indexFile = roadmapData?.files.find((f) => f.slug === "index");
    return indexFile?.title ?? slugToTitle(roadmap);
  }, [roadmapData, roadmap]);

  const tracks = useMemo<TrackNode[]>(() => {
    if (!roadmapData) return [];
    const trackMap = new Map<string, TrackNode>();
    for (const file of roadmapData.files) {
      if (!file.track) continue;
      if (!trackMap.has(file.track)) {
        trackMap.set(file.track, {
          slug: file.track,
          title: (file as unknown as { trackTitle?: string }).trackTitle ?? slugToTitle(file.track),
          topics: [],
        });
      }
      if (file.slug !== "index") {
        trackMap.get(file.track)!.topics.push({
          slug: file.slug,
          title: file.title,
          state: file.state as "published" | "pending_review",
          track: file.track,
          trackTitle: (file as unknown as { trackTitle?: string }).trackTitle ?? slugToTitle(file.track),
        });
      }
    }
    return [...trackMap.values()];
  }, [roadmapData]);

  // ── Selected node data ───────────────────────────────────────────────────

  const selectedTrack = useMemo(() => {
    if (!selectedNode) return null;
    if (selectedNode.type === "track") return tracks.find((t) => t.slug === selectedNode.slug) ?? null;
    return null;
  }, [selectedNode, tracks]);

  const selectedTopic = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "topic") return null;
    const track = tracks.find((t) => t.slug === selectedNode.trackSlug);
    return track?.topics.find((t) => t.slug === selectedNode.topicSlug) ?? null;
  }, [selectedNode, tracks]);

  const toggleTrack = (slug: string) => {
    setOpenTracks((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Top header */}
      <header className="flex items-center justify-between border-b px-6 py-3.5 bg-background shrink-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/admin/roadmaps" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="size-3 text-muted-foreground/40" />
          <Link to="/admin/roadmaps" className="hover:text-foreground transition-colors">
            Roadmaps
          </Link>
          <ChevronRight className="size-3 text-muted-foreground/40" />
          <span className="font-medium text-foreground capitalize">{roadmap}</span>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Eye className="size-3.5" />
            Preview
          </Button>
          <Button size="sm" className="gap-1.5">
            <Save className="size-3.5" />
            Save Changes
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left: Hierarchy Structure ── */}
        <div className="flex flex-col w-[480px] shrink-0 border-r min-h-0 overflow-hidden">
          {/* Sub-header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
            <div>
              {isLoading ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <h1 className="text-base font-semibold">{roadmapTitle}</h1>
              )}
              {isLoading ? (
                <Skeleton className="h-3.5 w-64 mt-1.5" />
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage hierarchical tracks and topics for the{" "}
                  <span className="capitalize">{roadmap}</span> ecosystem.
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <Plus className="size-3.5" />
              Add Track
            </Button>
          </div>

          {/* Section label */}
          <div className="px-5 py-2.5 border-b shrink-0">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">
              Hierarchy Structure
            </span>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <HierarchySkeleton />
            ) : tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Folder className="size-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No tracks yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Add a track to start organizing content.
                </p>
              </div>
            ) : (
              <div className="py-2">
                {tracks.map((track) => {
                  const isOpen = openTracks.has(track.slug);
                  const isTrackSelected =
                    selectedNode?.type === "track" && selectedNode.slug === track.slug;
                  return (
                    <TrackRow
                      key={track.slug}
                      track={track}
                      roadmap={roadmap}
                      isOpen={isOpen}
                      isSelected={isTrackSelected}
                      selectedTopicSlug={
                        selectedNode?.type === "topic" && selectedNode.trackSlug === track.slug
                          ? selectedNode.topicSlug
                          : null
                      }
                      onToggle={() => toggleTrack(track.slug)}
                      onSelectTrack={() => setSelectedNode({ type: "track", slug: track.slug })}
                      onSelectTopic={(topicSlug) =>
                        setSelectedNode({ type: "topic", trackSlug: track.slug, topicSlug })
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Properties Panel ── */}
        <div className="flex flex-col w-72 shrink-0 border-r min-h-0 overflow-hidden">
          {selectedNode ? (
            <PropertiesPanel
              selectedNode={selectedNode}
              selectedTrack={selectedTrack}
              selectedTopic={selectedTopic}
              roadmap={roadmap}
            />
          ) : (
            <EmptyProperties />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Track Row ────────────────────────────────────────────────────────────────

function TrackRow({
  track,
  roadmap,
  isOpen,
  isSelected,
  selectedTopicSlug,
  onToggle,
  onSelectTrack,
  onSelectTopic,
}: {
  track: TrackNode;
  roadmap: string;
  isOpen: boolean;
  isSelected: boolean;
  selectedTopicSlug: string | null;
  onToggle: () => void;
  onSelectTrack: () => void;
  onSelectTopic: (slug: string) => void;
}) {
  return (
    <div>
      {/* Track header */}
      <div
        className={cn(
          "group flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
          isSelected && "bg-muted",
        )}
      >
        <GripVertical className="size-3.5 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0"
          onFocus={onSelectTrack}
        >
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground/60 shrink-0 transition-transform duration-150",
              isOpen && "rotate-90",
            )}
          />
          {isOpen ? (
            <FolderOpen className="size-4 text-blue-500 shrink-0" />
          ) : (
            <Folder className="size-4 text-blue-500 shrink-0" />
          )}
          <span
            className="text-sm font-medium truncate"
            onClick={(e) => {
              e.stopPropagation();
              onSelectTrack();
            }}
          >
            {track.title}
          </span>
        </button>
        <button
          className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
          title={`Add topic to ${track.title}`}
        >
          <Plus className="size-3" />
        </button>
      </div>

      {/* Topics */}
      {isOpen && (
        <div>
          {track.topics.map((topic) => {
            const isActive = selectedTopicSlug === topic.slug;
            return (
              <div
                key={topic.slug}
                onClick={() => onSelectTopic(topic.slug)}
                className={cn(
                  "group flex items-center gap-2 pl-12 pr-4 py-2 cursor-pointer hover:bg-muted/50 transition-colors border-l-2 ml-8",
                  isActive
                    ? "border-blue-500 bg-blue-500/5"
                    : "border-transparent",
                )}
              >
                <GripVertical className="size-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                <File className="size-3.5 text-blue-400 shrink-0" />
                <span className="flex-1 text-sm truncate">{topic.title}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {topic.state === "pending_review" ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/20">
                      Pending
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/20">
                      Published
                    </span>
                  )}
                  {isActive && (
                    <Link
                      to="/admin/content/$roadmap/$track/$slug"
                      params={{ roadmap, track: topic.track, slug: topic.slug }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground/40 hover:text-primary transition-colors"
                      title="Open in editor"
                    >
                      <ExternalLink className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add topic inline */}
          <button className="flex items-center gap-1.5 pl-12 pr-4 py-2 text-xs text-muted-foreground/50 hover:text-primary transition-colors ml-8 w-full text-left">
            <Plus className="size-3" />
            Add Topic to {track.title}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropertiesPanel({
  selectedNode,
  selectedTrack,
  selectedTopic,
  roadmap,
}: {
  selectedNode: SelectedNode;
  selectedTrack: TrackNode | null;
  selectedTopic: TopicNode | null;
  roadmap: string;
}) {
  const node = selectedTopic ?? selectedTrack;
  const nodeType = selectedNode.type === "topic" ? "TOPIC" : "TRACK";

  const [title, setTitle] = useState(node?.title ?? "");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  const slug =
    selectedNode.type === "topic"
      ? `${roadmap}/${selectedNode.trackSlug}/`
      : `${roadmap}/`;
  const slugSuffix =
    selectedNode.type === "topic" ? selectedNode.topicSlug : selectedNode.slug;

  const addSkill = (s: string) => {
    const trimmed = s.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
    }
    setSkillInput("");
  };

  const removeSkill = (s: string) => setSkills((prev) => prev.filter((sk) => sk !== s));

  const docsUrl =
    selectedNode.type === "topic"
      ? `http://localhost:4000/docs/${roadmap}/${selectedNode.trackSlug}/${selectedNode.topicSlug}`
      : `http://localhost:4000/docs/${roadmap}`;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <span className="text-xs font-semibold">Node Properties</span>
        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide px-2">
          {nodeType}
        </Badge>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Slug</label>
          <div className="flex items-center rounded-md border bg-muted/40 overflow-hidden">
            <span className="px-2.5 py-2 text-xs text-muted-foreground/60 bg-muted border-r font-mono whitespace-nowrap">
              {slug}
            </span>
            <input
              type="text"
              defaultValue={slugSuffix}
              className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-xs font-mono focus:outline-none"
            />
          </div>
        </div>

        {/* Linked Skills */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Linked Skills</label>
          <div className="rounded-md border bg-background p-2 min-h-[60px]">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                >
                  {skill}
                  <button
                    onClick={() => removeSkill(skill)}
                    className="text-primary/60 hover:text-primary transition-colors"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="+ Add Linked Skill"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                className="w-full text-xs border border-dashed rounded px-2 py-1 bg-transparent focus:outline-none focus:border-primary placeholder:text-muted-foreground/40"
              />
              {skillInput && (
                <div className="absolute top-full left-0 mt-1 w-full rounded-md border bg-popover shadow-md z-10 max-h-32 overflow-y-auto">
                  {SKILL_SUGGESTIONS.filter(
                    (s) =>
                      s.toLowerCase().includes(skillInput.toLowerCase()) &&
                      !skills.includes(s),
                  ).map((s) => (
                    <button
                      key={s}
                      onClick={() => addSkill(s)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
          <div className="relative">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full appearance-none rounded-md border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 rotate-90 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 space-y-2 border-t p-4">
        <Button className="w-full text-sm" size="sm">
          Apply Changes
        </Button>
        <button className="w-full text-xs text-destructive hover:text-destructive/80 transition-colors py-1">
          Discard Edits
        </button>
      </div>

      {/* Docs Site Preview */}
      <div className="shrink-0 border-t">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50">
            Docs Site Preview
          </span>
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground/40 hover:text-primary transition-colors"
          >
            <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="px-4 pb-4">
          <div className="rounded-md border bg-muted/30 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b bg-muted/50">
              <div className="flex gap-1">
                <div className="size-1.5 rounded-full bg-red-400/60" />
                <div className="size-1.5 rounded-full bg-amber-400/60" />
                <div className="size-1.5 rounded-full bg-emerald-400/60" />
              </div>
              <span className="text-[9px] text-muted-foreground/50 font-mono truncate">
                {docsUrl}
              </span>
            </div>
            <div className="h-28 flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="h-2 w-24 rounded bg-muted-foreground/10 mx-auto" />
                <div className="h-1.5 w-32 rounded bg-muted-foreground/10 mx-auto" />
                <div className="h-1.5 w-20 rounded bg-muted-foreground/10 mx-auto" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyProperties() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <span className="text-xs font-semibold">Node Properties</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <File className="size-8 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">No node selected</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Click a track or topic to view its properties.
        </p>
      </div>
    </div>
  );
}

function HierarchySkeleton() {
  return (
    <div className="space-y-2 py-2 px-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2 py-2">
            <Skeleton className="size-3 rounded" />
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="pl-8 space-y-1.5">
            <div className="flex items-center gap-2 py-1.5">
              <Skeleton className="size-3.5 rounded" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-4 w-16 ml-auto rounded-full" />
            </div>
            <div className="flex items-center gap-2 py-1.5">
              <Skeleton className="size-3.5 rounded" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-4 w-16 ml-auto rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
