"use client";

import { useState, useCallback, type FormEvent } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import Link from "next/link";

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Initialize name from session once loaded
  if (session?.user && !initialized) {
    setName(session.user.name ?? "");
    setInitialized(true);
  }

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFeedback(null);
      setLoading(true);
      try {
        const { error } = await authClient.updateUser({
          name: name.trim(),
        });
        if (error) {
          setFeedback({
            type: "error",
            message: error.message ?? "Failed to update username.",
          });
        } else {
          setFeedback({ type: "success", message: "Username updated." });
        }
      } catch {
        setFeedback({
          type: "error",
          message: "Something went wrong. Please try again.",
        });
      } finally {
        setLoading(false);
      }
    },
    [name],
  );

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-32 animate-pulse rounded-md bg-fd-muted" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-fd-muted-foreground">
          Sign in to view your profile.
        </p>
        <Link
          href="/sign-in"
          className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-fd-border bg-fd-card p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-fd-foreground">
          Profile
        </h1>

        <div className="mb-4">
          <span className="text-sm font-medium text-fd-muted-foreground">
            Email
          </span>
          <p className="mt-1 text-sm text-fd-foreground">
            {session.user.email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label
            htmlFor="profile-name"
            className="text-sm font-medium text-fd-foreground"
          >
            Username
          </label>
          <input
            id="profile-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-md border border-fd-border bg-fd-background px-3 py-2 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus:ring-2 focus:ring-fd-ring"
            disabled={loading}
          />

          {feedback && (
            <p
              className={`text-sm ${
                feedback.type === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-500"
              }`}
              role="alert"
            >
              {feedback.message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || name.trim() === ""}
            className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
