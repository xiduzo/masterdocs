import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ContentEditorView } from "@/components/content/editor-view";

const searchSchema = z.object({
  fromBranch: z.boolean().optional(),
});

export const Route = createFileRoute("/admin/content/$roadmap/$track/$slug")({
  component: ContentEditor,
  validateSearch: searchSchema,
});

function ContentEditor() {
  const { roadmap, track, slug } = Route.useParams();
  const { fromBranch } = Route.useSearch();
  const fileKey = `${roadmap}/${track}/${slug}`;
  return (
    <ContentEditorView key={fileKey} roadmap={roadmap} slug={slug} track={track} fromBranch={fromBranch} />
  );
}
