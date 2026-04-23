import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@masterdocs/ui/components/badge";
import { Button } from "@masterdocs/ui/components/button";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import { cn } from "@masterdocs/ui/lib/utils";
import {
  BookOpen,
  CheckCircle2,
  Code2,
  Edit,
  FileText,
  Filter,
  History,
  Layers,
  ListFilter,
  Paintbrush,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/admin/roadmaps/")({
  component: RoadmapsDashboard,
});

// Deterministic icon + color per roadmap slug
const ROADMAP_PALETTES = [
  { icon: Code2, bg: "bg-blue-500/15", text: "text-blue-500", border: "border-blue-500/20" },
  { icon: Paintbrush, bg: "bg-violet-500/15", text: "text-violet-500", border: "border-violet-500/20" },
  { icon: FileText, bg: "bg-amber-500/15", text: "text-amber-500", border: "border-amber-500/20" },
  { icon: Layers, bg: "bg-emerald-500/15", text: "text-emerald-500", border: "border-emerald-500/20" },
  { icon: Users, bg: "bg-rose-500/15", text: "text-rose-500", border: "border-rose-500/20" },
  { icon: BookOpen, bg: "bg-cyan-500/15", text: "text-cyan-500", border: "border-cyan-500/20" },
];

function getPalette(slug: string) {
  const hash = slug.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ROADMAP_PALETTES[hash % ROADMAP_PALETTES.length];
}

function slugToTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TABS = ["All Items", "Recently Updated", "Archived"] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 10;

function RoadmapsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("All Items");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());
  const deleteRoadmapMutation = useMutation(trpc.content.deleteRoadmap.mutationOptions());

  // ── Derived data ──────────────────────────────────────────────────────────

  const roadmapRows = useMemo(() => {
    if (!data) return [];
    return data.map((r) => {
      const tracks = new Set(r.files.filter((f) => f.track).map((f) => f.track)).size;
      const topics = r.files.filter((f) => f.track).length;
      const hasPending = r.files.some((f) => f.state === "pending_review");
      const indexFile = r.files.find((f) => f.slug === "index");
      const title = indexFile?.title ?? slugToTitle(r.roadmap);
      const recentlyUpdated = hasPending;
      return {
        slug: r.roadmap,
        title,
        tracks,
        topics,
        status: hasPending ? "Draft" : "Published",
        recentlyUpdated,
        palette: getPalette(r.roadmap),
      };
    });
  }, [data]);

  const stats = useMemo(() => {
    const total = roadmapRows.length;
    const published = roadmapRows.filter((r) => r.status === "Published").length;
    const draft = roadmapRows.filter((r) => r.status === "Draft").length;
    return { total, published, draft };
  }, [roadmapRows]);

  const recentActivity = useMemo(() => {
    if (!data) return [];
    const pending: Array<{ roadmap: string; title: string; fileTitle: string }> = [];
    for (const r of data) {
      for (const f of r.files) {
        if (f.state === "pending_review") {
          pending.push({
            roadmap: r.roadmap,
            title: slugToTitle(r.roadmap),
            fileTitle: f.title,
          });
        }
      }
    }
    return pending.slice(0, 5);
  }, [data]);

  const filteredRows = useMemo(() => {
    let rows = roadmapRows;
    if (activeTab === "Recently Updated") rows = rows.filter((r) => r.recentlyUpdated);
    if (activeTab === "Archived") rows = [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
    }
    return rows;
  }, [roadmapRows, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDeleteRoadmap = async (slug: string) => {
    const confirmed = window.confirm(`Delete roadmap "${slug}" and everything inside it? This cannot be undone.`);
    if (!confirmed) return;
    deleteRoadmapMutation.mutate(
      { roadmap: slug },
      {
        onSuccess: () => {
          toast.success("Roadmap deleted");
          queryClient.invalidateQueries({ queryKey: trpc.content.list.queryKey() });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full">
      {/* Top header bar */}
      <header className="flex items-center justify-between border-b px-6 py-3.5 bg-background sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Roadmap Architect</h1>
          <span className="text-muted-foreground/40 text-sm">/</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search roadmaps..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-52 rounded-md border bg-muted/40 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
            A
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Page title + CTA */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Curriculum Roadmaps</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage and organize educational tracks for institutional learning paths.
            </p>
          </div>
          <Link to="/admin/roadmaps">
            <Button className="gap-2">
              <Plus className="size-4" />
              Create New Roadmap
            </Button>
          </Link>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatsCard
            icon={Layers}
            iconClass="text-primary bg-primary/10"
            label="Total Roadmaps"
            value={stats.total}
            loading={isLoading}
          />
          <StatsCard
            icon={CheckCircle2}
            iconClass="text-emerald-600 bg-emerald-500/10"
            label="Published"
            value={stats.published}
            loading={isLoading}
          />
          <StatsCard
            icon={FileText}
            iconClass="text-muted-foreground bg-muted"
            label="Draft Mode"
            value={stats.draft}
            loading={isLoading}
          />
        </div>

        {/* Table card */}
        <div className="rounded-xl border bg-card">
          {/* Tabs + filter row */}
          <div className="flex items-center justify-between px-5 border-b">
            <div className="flex">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setPage(1);
                  }}
                  className={cn(
                    "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                    activeTab === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
                <Filter className="size-3" />
                Filter
              </button>
              <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
                <ListFilter className="size-3" />
                Sort
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium w-8"></th>
                  <th className="px-2 py-3 text-left font-medium">Roadmap Title</th>
                  <th className="px-4 py-3 text-left font-medium">Tracks / Topics</th>
                  <th className="px-4 py-3 text-left font-medium">Last Updated</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-5 py-4"><Skeleton className="size-8 rounded-lg" /></td>
                      <td className="px-2 py-4">
                        <Skeleton className="h-4 w-36 mb-1.5" />
                        <Skeleton className="h-3 w-24" />
                      </td>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="px-4 py-4 text-right"><Skeleton className="h-7 w-16 ml-auto" /></td>
                    </tr>
                  ))}

                {!isLoading && pagedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                      {search ? "No roadmaps match your search." : "No roadmaps found."}
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  pagedRows.map((row) => {
                    const { icon: Icon, bg, text, border } = row.palette;
                    return (
                      <tr
                        key={row.slug}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-5 py-3.5">
                          <div
                            className={cn(
                              "flex size-9 items-center justify-center rounded-lg border",
                              bg,
                              border,
                            )}
                          >
                            <Icon className={cn("size-4", text)} />
                          </div>
                        </td>
                        <td className="px-2 py-3.5">
                          <p className="font-medium text-sm">{row.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                            {row.slug.replace(/-/g, " ")}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">
                          {row.tracks > 0 ? (
                            <span>
                              <span className="font-medium text-foreground">{row.tracks}</span>{" "}
                              Track{row.tracks !== 1 ? "s" : ""}
                              {row.topics > 0 && (
                                <>
                                  {" "}
                                  <span className="text-muted-foreground/50">•</span>{" "}
                                  <span className="font-medium text-foreground">{row.topics}</span>{" "}
                                  Topic{row.topics !== 1 ? "s" : ""}
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          <span className="text-muted-foreground/50">—</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              to="/admin/roadmaps/$roadmap"
                              params={{ roadmap: row.slug }}
                            >
                              <button
                                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Edit roadmap"
                              >
                                <Edit className="size-3.5" />
                              </button>
                            </Link>
                            <button
                              onClick={() => handleDeleteRoadmap(row.slug)}
                              disabled={deleteRoadmapMutation.isPending}
                              className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete roadmap"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && filteredRows.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}{" "}
                roadmap{filteredRows.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1">
                <PaginationButton
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  ‹
                </PaginationButton>
                {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => i + 1).map((p) => (
                  <PaginationButton
                    key={p}
                    onClick={() => setPage(p)}
                    active={p === page}
                  >
                    {p}
                  </PaginationButton>
                ))}
                {totalPages > 8 && page < totalPages && (
                  <>
                    <span className="px-1">…</span>
                    <PaginationButton onClick={() => setPage(totalPages)} active={page === totalPages}>
                      {totalPages}
                    </PaginationButton>
                  </>
                )}
                <PaginationButton
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  ›
                </PaginationButton>
              </div>
            </div>
          )}
        </div>

        {/* Bottom two-column section */}
        <div className="grid grid-cols-5 gap-4">
          {/* Recent Activity */}
          <div className="col-span-3 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <History className="size-4 text-muted-foreground/50" />
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-6 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-48 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">
                      A
                    </div>
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">Admin</span> updated{" "}
                        <span className="text-muted-foreground">"{item.fileTitle}"</span>{" "}
                        in{" "}
                        <Link
                          to="/admin/roadmaps/$roadmap"
                          params={{ roadmap: item.roadmap }}
                          className="text-primary hover:underline font-medium"
                        >
                          {item.title}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Pending review</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Need Help */}
          <div className="col-span-2 rounded-xl border bg-card p-5 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-sm font-semibold mb-2">Need Help?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Read our documentation on how to structure complex educational tracks or contact
                support for architectural guidance.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="https://fumadocs.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View Docs
                </a>
                <span className="text-muted-foreground/30 text-xs">·</span>
                <button className="text-xs font-medium text-primary hover:underline">
                  Contact Expert
                </button>
              </div>
            </div>
            {/* Decorative star */}
            <div className="absolute -bottom-4 -right-4 size-24 rounded-full bg-primary/5 flex items-center justify-center">
              <div className="size-16 rounded-full bg-primary/5 flex items-center justify-center">
                <span className="text-3xl text-primary/10 select-none">✦</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  iconClass,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={cn("flex size-9 items-center justify-center rounded-lg", iconClass)}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-10 mt-1" />
          ) : (
            <p className="text-2xl font-bold mt-0.5">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Published") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10 font-medium text-xs">
        Published
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-xs font-medium">
      Draft
    </Badge>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-6 items-center justify-center rounded text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
