import type React from "react";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@masterdocs/ui/components/sidebar";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

import { ContentSidebar } from "@/components/content/sidebar";

export const Route = createFileRoute("/admin/content")({
  component: ContentLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
    if (session.data?.user.role !== "admin") {
      redirect({ to: "/", throw: true });
    }
    return { session };
  },
});

function ContentLayout() {
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
