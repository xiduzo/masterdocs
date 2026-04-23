"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, User } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email ? email[0].toUpperCase() : "?";
}

export function AuthAvatar() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await signOut();
  }, []);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  if (isPending) {
    return <div className="size-7 animate-pulse rounded-full bg-fd-muted" />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/sign-in"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
      >
        <LogIn className="size-3.5" />
        Sign In
      </Link>
    );
  }

  const initials = getInitials(session.user.name, session.user.email);
  const label = session.user.name || session.user.email;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        className="flex size-7 items-center justify-center rounded-full bg-fd-primary/10 text-[11px] font-semibold text-fd-primary ring-1 ring-fd-primary/20 transition-opacity hover:opacity-80"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-fd-border bg-fd-background shadow-lg">
          {/* Identity */}
          <div className="flex items-center gap-2.5 border-b border-fd-border px-3 py-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fd-primary/10 text-[11px] font-semibold text-fd-primary">
              {initials}
            </div>
            <span className="min-w-0 truncate text-xs text-fd-foreground">
              {label}
            </span>
          </div>

          {/* Actions */}
          <div className="p-1">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
            >
              <User className="size-3.5" />
              Profile
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
