import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@fumadocs-learning/ui/components/empty";
import { Separator } from "@fumadocs-learning/ui/components/separator";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldAlertIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { ContentSidebar } from "@/components/content/sidebar";

export const Route = createFileRoute("/admin/content")({
  component: ContentLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    if (session.data.user.role !== "admin") {
      return { session, accessDenied: true };
    }
    return { session, accessDenied: false };
  },
});

function ContentLayout() {
  const { accessDenied } = Route.useRouteContext();

  if (accessDenied) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Access Denied</EmptyTitle>
          <EmptyDescription>
            You do not have permission to access the content editor.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="w-64 overflow-y-auto">
        <ContentSidebar />
      </aside>
      <Separator orientation="vertical" />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
