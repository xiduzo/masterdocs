import type { QueryClient } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

// ─── Types ───────────────────────────────────────────────────────────────────
// These mirror the API output shape. If the API changes a field, TypeScript
// will catch it at the call site (trpc.content.list usage).

export type ContentFile = {
  slug: string;
  title: string;
  path: string;
  state: "published" | "pending_review";
  track?: string;
  trackTitle?: string;
};

export type ContentListGroup = {
  roadmap: string;
  files: ContentFile[];
};

export type FileNode = {
  type: "file";
  name: string;
  slug: string;
  roadmap: string;
  state: "published" | "pending_review";
  track?: string;
  trackTitle?: string;
};

export type FolderNode = {
  type: "folder";
  name: string;
  defaultOpen?: boolean;
  children: TreeNode[];
  roadmap?: string;
  track?: string;
};

export type TreeNode = FileNode | FolderNode;

// ─── Shared query key ────────────────────────────────────────────────────────

export const contentListQueryKey = trpc.content.list.queryKey();

// ─── Optimistic update helper ─────────────────────────────────────────────────

export function applyOptimisticContentListUpdate(
  queryClient: QueryClient,
  updateGroups: (groups: ContentListGroup[]) => ContentListGroup[],
): ContentListGroup[] | undefined {
  const previousGroups = queryClient.getQueryData<ContentListGroup[]>(contentListQueryKey);

  queryClient.setQueryData<ContentListGroup[]>(contentListQueryKey, (groups) => {
    if (!groups) return groups;
    return updateGroups(groups);
  });

  return previousGroups;
}

// ─── Pure tree-building functions ─────────────────────────────────────────────

export function hasPendingDescendant(node: TreeNode): boolean {
  if (node.type === "file") return node.state === "pending_review";
  return node.children.some(hasPendingDescendant);
}

export function buildTree(groups: ContentListGroup[]): TreeNode[] {
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

    const tracks = [...trackMap.entries()];

    const toFileNode = (file: ContentFile): FileNode => ({
      type: "file",
      name: file.title,
      slug: file.slug,
      roadmap: group.roadmap,
      state: file.state,
      track: file.track,
      trackTitle: file.trackTitle,
    });

    const children: TreeNode[] = [
      ...untracked.map(toFileNode),
      ...tracks.map(([trackSlug, files]) => ({
        type: "folder" as const,
        name: files[0]?.trackTitle ?? trackSlug,
        children: files.map(toFileNode),
        roadmap: group.roadmap,
        track: trackSlug,
      })),
    ];

    return { type: "folder", name: group.roadmap, children, roadmap: group.roadmap };
  });
}

export function updateRoadmapFiles(
  groups: ContentListGroup[],
  roadmap: string,
  updateFiles: (files: ContentFile[]) => ContentFile[],
): ContentListGroup[] {
  return groups.map((group) => {
    if (group.roadmap !== roadmap) return group;
    return { ...group, files: updateFiles(group.files) };
  });
}

export function reorderRoadmapLevelFiles(files: ContentFile[], orderedSlugs: string[]): ContentFile[] {
  const untrackedFiles = files.filter((file) => !file.track);
  const trackedFiles = files.filter((file) => file.track);
  const fileBySlug = new Map(untrackedFiles.map((file) => [file.slug, file]));
  const reorderedFiles = orderedSlugs
    .map((slug) => fileBySlug.get(slug))
    .filter((file): file is ContentFile => Boolean(file));
  const remainingFiles = untrackedFiles.filter((file) => !orderedSlugs.includes(file.slug));

  return [...reorderedFiles, ...remainingFiles, ...trackedFiles];
}

export function reorderTrackFiles(files: ContentFile[], track: string, orderedSlugs: string[]): ContentFile[] {
  const trackFiles = files.filter((file) => file.track === track);
  const fileBySlug = new Map(trackFiles.map((file) => [file.slug, file]));
  const reorderedFiles = orderedSlugs
    .map((slug) => fileBySlug.get(slug))
    .filter((file): file is ContentFile => Boolean(file));
  const remainingFiles = trackFiles.filter((file) => !orderedSlugs.includes(file.slug));
  const nextTrackFiles = [...reorderedFiles, ...remainingFiles];
  let trackIndex = 0;

  return files.map((file) => {
    if (file.track !== track) return file;
    const nextFile = nextTrackFiles[trackIndex];
    trackIndex += 1;
    return nextFile ?? file;
  });
}

export function reorderTracks(files: ContentFile[], orderedTracks: string[]): ContentFile[] {
  const untrackedFiles = files.filter((file) => !file.track);
  const trackFilesBySlug = new Map<string, ContentFile[]>();

  for (const file of files) {
    if (!file.track) continue;
    const existingFiles = trackFilesBySlug.get(file.track) ?? [];
    existingFiles.push(file);
    trackFilesBySlug.set(file.track, existingFiles);
  }

  const currentTrackOrder = [...trackFilesBySlug.keys()];
  const nextTrackOrder = [
    ...orderedTracks.filter((track) => trackFilesBySlug.has(track)),
    ...currentTrackOrder.filter((track) => !orderedTracks.includes(track)),
  ];

  return [
    ...untrackedFiles,
    ...nextTrackOrder.flatMap((track) => trackFilesBySlug.get(track) ?? []),
  ];
}

export function removeFileFromGroups(
  groups: ContentListGroup[],
  roadmap: string,
  slug: string,
  track?: string,
): ContentListGroup[] {
  return updateRoadmapFiles(groups, roadmap, (files) =>
    files.filter((file) => !(file.slug === slug && file.track === track)),
  );
}

export function removeTrackFromGroups(
  groups: ContentListGroup[],
  roadmap: string,
  track: string,
): ContentListGroup[] {
  return updateRoadmapFiles(groups, roadmap, (files) =>
    files.filter((file) => file.track !== track),
  );
}

export function removeRoadmapFromGroups(groups: ContentListGroup[], roadmap: string): ContentListGroup[] {
  return groups.filter((group) => group.roadmap !== roadmap);
}
