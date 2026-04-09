import type React from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@masterdocs/ui/components/empty";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@masterdocs/ui/components/sidebar";
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
    if (session.data?.user.role !== "admin") {
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
    <SidebarProvider className="h-full min-h-0 overflow-hidden" style={{ "--sidebar-width": "18rem" } as React.CSSProperties}>
      <Sidebar>
        <ContentSidebar />
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
