import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@masterdocs/ui/components/empty";
import { createFileRoute } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

export const Route = createFileRoute("/admin/roadmaps/$roadmap/tracks/")({
  component: TracksIndex,
});

function TracksIndex() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon />
        </EmptyMedia>
        <EmptyTitle>No file selected</EmptyTitle>
        <EmptyDescription>
          Select a file from the sidebar to start editing, or create a new file.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
