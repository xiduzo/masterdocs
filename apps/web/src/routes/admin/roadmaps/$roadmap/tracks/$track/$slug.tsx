import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ContentEditorView } from "@/components/content/editor-view";
import { slugToTitle } from "@/routes/-breadcrumbs";

const searchSchema = z.object({
  fromBranch: z.boolean().optional(),
});

export const Route = createFileRoute("/admin/roadmaps/$roadmap/tracks/$track/$slug")({
  component: ContentEditor,
  validateSearch: searchSchema,
  staticData: {
    crumb: (params) => [
      { label: slugToTitle(params.track ?? "") },
      { label: slugToTitle(params.slug ?? "") },
    ],
  },
});

function ContentEditor() {
  const { roadmap, track, slug } = Route.useParams();
  const { fromBranch } = Route.useSearch();
  const fileKey = `${roadmap}/${track}/${slug}`;
  return (
    <ContentEditorView key={fileKey} roadmap={roadmap} slug={slug} track={track} fromBranch={fromBranch} />
  );
}
