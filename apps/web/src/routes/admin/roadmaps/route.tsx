import type React from "react";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { cn } from "@masterdocs/ui/lib/utils";
import {
  BookOpen,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin/roadmaps")({
  component: RoadmapsLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) redirect({ to: "/login", throw: true });
    if (session.data?.user.role !== "admin") redirect({ to: "/", throw: true });
    return { session };
  },
});

function RoadmapsLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 min-w-0 overflow-auto bg-background">
        <Outlet />
      </div>
    </div>
  );
}

// ─── Admin Sidebar ────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{
  icon: React.ElementType;
  label: string;
  to: string;
  matchPrefix: string;
  disabled?: boolean;
}> = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    to: "/admin/roadmaps",
    matchPrefix: "__never__",
  },
  {
    icon: Map,
    label: "Roadmaps",
    to: "/admin/roadmaps",
    matchPrefix: "/admin/roadmaps",
  },
  {
    icon: FileText,
    label: "Content",
    to: "/admin/content",
    matchPrefix: "/admin/content",
  },
  {
    icon: Users,
    label: "Users",
    to: "/admin/roadmaps",
    matchPrefix: "__never__",
    disabled: true,
  },
  {
    icon: Settings,
    label: "Settings",
    to: "/admin/roadmaps",
    matchPrefix: "__never__",
    disabled: true,
  },
];

function AdminSidebar() {
  const navigate = useNavigate();

  const handleSignOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate({ to: "/" }),
      },
    });
  };

  return (
    <aside
      className="flex w-52 shrink-0 flex-col overflow-hidden"
      style={{ background: "#0f172a" }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/[0.06]">
        <div className="flex size-7 items-center justify-center rounded-md bg-blue-600">
          <BookOpen className="size-3.5 text-white" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white leading-none">
            Admin Console
          </p>
          <p className="text-[9px] text-white/30 mt-1 leading-none">
            Corporate Modernism
          </p>
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.label} {...item} />
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-white/[0.06] space-y-0.5 px-2 py-3">
        <button className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors">
          <HelpCircle className="size-3.5" />
          Support
        </button>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
        >
          <LogOut className="size-3.5" />
          Log Out
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  icon: Icon,
  label,
  to,
  matchPrefix,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  to: string;
  matchPrefix: string;
  disabled?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = matchPrefix !== "__never__" && pathname.startsWith(matchPrefix);

  if (disabled) {
    return (
      <span className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-white/20 cursor-default select-none">
        <Icon className="size-3.5" />
        {label}
      </span>
    );
  }

  return (
    <Link
      to={to as "/admin/roadmaps" | "/admin/content"}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
        isActive
          ? "bg-blue-600 text-white"
          : "text-white/40 hover:bg-white/[0.06] hover:text-white/70",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}
