import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  fromContentList,
  type Topic as RoadmapTopic,
  type Track as RoadmapTrack,
} from "@masterdocs/api/lib/roadmap-tree";
import { slugToTitle, titleToSlug } from "@masterdocs/api/lib/slug";

import { useContentMutation } from "@/hooks/use-content-mutation";
import { trpc } from "@/utils/trpc";

/**
 * Owns the Scaffold Submission verbs for a single Roadmap: reorder
 * Tracks/Topics, create Track, create Topic — plus the derived view of
 * that Roadmap as a tree (via `fromContentList`).
 *
 * Display components (drag-and-drop handles, inline inputs, sortable
 * rows) receive verbs as callbacks and stay free of `content.list`
 * cache shape, mutation wiring, and slug derivation.
 */
export function useRoadmapEditor(roadmap: string) {
  const { data, isLoading } = useQuery(trpc.content.list.queryOptions());

  const roadmapData = useMemo(
    () => data?.find((r) => r.roadmap === roadmap),
    [data, roadmap],
  );

  const roadmapTree = useMemo(
    () => (roadmapData ? fromContentList(roadmapData) : undefined),
    [roadmapData],
  );

  const tracks: RoadmapTrack[] = roadmapTree?.tracks ?? [];
  const roadmapTitle = roadmapTree?.title ?? slugToTitle(roadmap);

  const reorderMutation = useContentMutation({
    ...trpc.content.reorder.mutationOptions(),
    errorPrefix: "Reorder failed",
  });

  const createTrackMutation = useContentMutation({
    ...trpc.content.createTrack.mutationOptions(),
    successMessage: "Track created",
    errorPrefix: "",
  });

  const createTopicMutation = useContentMutation({
    ...trpc.content.create.mutationOptions(),
    successMessage: "Topic created",
    errorPrefix: "",
  });

  /** Persist a new top-to-bottom Track ordering for this Roadmap. */
  const reorderTracks = (orderedTrackSlugs: string[]): void => {
    const ordered = orderedTrackSlugs
      .map((slug) => tracks.find((t) => t.slug === slug))
      .filter((t): t is RoadmapTrack => !!t);
    const items = ordered.flatMap((track, i) =>
      track.topics.map((topic) => ({
        slug: topic.slug,
        track: track.slug,
        trackOrder: i + 1,
      })),
    );
    if (items.length === 0) return;
    reorderMutation.mutate({ roadmap, items });
  };

  /** Persist a new top-to-bottom Topic ordering within a single Track. */
  const reorderTopicsInTrack = (
    trackSlug: string,
    orderedTopicSlugs: string[],
  ): void => {
    const track = tracks.find((t) => t.slug === trackSlug);
    if (!track) return;
    const ordered = orderedTopicSlugs
      .map((slug) => track.topics.find((t) => t.slug === slug))
      .filter((t): t is RoadmapTopic => !!t);
    const items = ordered.map((topic, i) => ({
      slug: topic.slug,
      track: track.slug,
      topicOrder: i + 1,
    }));
    if (items.length === 0) return;
    reorderMutation.mutate({ roadmap, items });
  };

  const createTrack = (
    title: string,
    options?: { onSuccess?: () => void },
  ): void => {
    const trackSlug = titleToSlug(title);
    createTrackMutation.mutate(
      { roadmap, trackSlug, trackTitle: title.trim() },
      { onSuccess: () => options?.onSuccess?.() },
    );
  };

  const createTopic = (
    trackSlug: string,
    title: string,
    options?: { onSuccess?: () => void },
  ): void => {
    const slug = titleToSlug(title);
    createTopicMutation.mutate(
      { roadmap, slug, track: trackSlug },
      { onSuccess: () => options?.onSuccess?.() },
    );
  };

  return {
    roadmapTitle,
    tracks,
    isLoading,
    reorderTracks,
    reorderTopicsInTrack,
    createTrack,
    createTopic,
    isCreatingTrack: createTrackMutation.isPending,
    isCreatingTopic: createTopicMutation.isPending,
  };
}
