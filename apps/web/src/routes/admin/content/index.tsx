import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@masterdocs/ui/components/empty";
import { Separator } from "@masterdocs/ui/components/separator";
import { SidebarTrigger } from "@masterdocs/ui/components/sidebar";
import { createFileRoute } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

export const Route = createFileRoute("/admin/content/")({
  component: ContentIndex,
});

function ContentIndex() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-background px-3 py-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm text-muted-foreground">Content</span>
      </div>
      <Empty className="flex-1">
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
    </div>
  );
}
