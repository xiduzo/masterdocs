"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";

export function AuthButton() {
  const { data: session, isPending } = useSession();

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, []);

  if (isPending) {
    return (
      <div className="h-8 w-16 animate-pulse rounded-md bg-fd-muted" />
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="text-sm text-fd-muted-foreground hover:text-fd-foreground"
        >
          {session.user.name || session.user.email}
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-foreground hover:bg-fd-accent"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/sign-in"
      className="rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
    >
      Sign In
    </Link>
  );
}
