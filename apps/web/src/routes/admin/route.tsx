import React from "react";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useMatches,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { cn } from "@masterdocs/ui/lib/utils";
import {
  BookOpen,
  ChevronRight,
  HelpCircle,
  LogOut,
  Map,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) redirect({ to: "/login", throw: true });
    if (session.data?.user.role !== "admin") redirect({ to: "/", throw: true });
    return { session };
  },
});

function slugToTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Crumb {
  label: string;
  href?: string;
}

function useBreadcrumbs(): Crumb[] {
  const matches = useMatches();
  const crumbs: Crumb[] = [];

  for (const match of matches) {
    const id = match.routeId as string;
    const params = match.params as Record<string, string>;

    if (id === "/admin/roadmaps/") {
      crumbs.push({ label: "Roadmaps", href: "/admin/roadmaps" });
    } else if (id === "/admin/roadmaps/$roadmap/") {
      crumbs.push({ label: slugToTitle(params.roadmap), href: `/admin/roadmaps/${params.roadmap}/` });
    } else if (id === "/admin/roadmaps/$roadmap/tracks/$slug") {
      crumbs.push({ label: slugToTitle(params.slug) });
    } else if (id === "/admin/roadmaps/$roadmap/tracks/$track/$slug") {
      crumbs.push({ label: slugToTitle(params.track) });
      crumbs.push({ label: slugToTitle(params.slug) });
    }
  }

  if (crumbs.length > 0) {
    delete crumbs[crumbs.length - 1].href;
  }

  return crumbs;
}

function AdminToolbar() {
  const crumbs = useBreadcrumbs();

  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-background px-6 py-3.5">
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRight className="size-3 text-muted-foreground/40" />
            )}
            {crumb.href ? (
              <Link
                to={crumb.href as "/admin/roadmaps"}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
        A
      </div>
    </header>
  );
}

function AdminLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        <AdminToolbar />
        <div className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </div>
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
    icon: Map,
    label: "Roadmaps",
    to: "/admin/roadmaps",
    matchPrefix: "/admin/roadmaps",
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
            Masterdocs
          </p>
          <p className="text-[9px] text-white/30 mt-1 leading-none">
            Admin Console
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
      to={to as "/admin/roadmaps"}
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
