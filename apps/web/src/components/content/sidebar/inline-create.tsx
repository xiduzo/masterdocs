import {
  SidebarMenuItem,
} from "@masterdocs/ui/components/sidebar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { File, Folder, FolderPlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { contentListQueryKey } from "./tree-utils";

// ─── Slug helpers ─────────────────────────────────────────────────────────────

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── InlineCreateInput ────────────────────────────────────────────────────────

export function InlineCreateInput({
  roadmap,
  track,
  onDone,
}: {
  roadmap: string;
  track?: string;
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
    if (!canSubmit || !track) return;
    createMutation.mutate(
      { roadmap, slug, track },
      {
        onSuccess: () => {
          toast.success("File created");
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
          onDone();
          navigate({
            to: "/admin/content/$roadmap/$track/$slug",
            params: { roadmap, track, slug },
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

// ─── InlineCreateRoadmap ──────────────────────────────────────────────────────

export function InlineCreateRoadmap({ onDone }: { onDone: () => void }) {
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
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
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

// ─── InlineCreateTrack ────────────────────────────────────────────────────────

export function InlineCreateTrack({
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
          queryClient.invalidateQueries({ queryKey: contentListQueryKey });
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
