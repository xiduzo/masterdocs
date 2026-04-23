import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/roadmaps/$roadmap/tracks")({
  component: () => <Outlet />,
});
