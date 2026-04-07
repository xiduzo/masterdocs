"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SkillToggleProps {
  id: string;
  label: string;
  initialCompleted: boolean;
  isAuthenticated: boolean;
}

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

export function SkillToggle({
  id,
  label,
  initialCompleted,
  isAuthenticated,
}: SkillToggleProps) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initialCompleted);
  const [pending, setPending] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!isAuthenticated) {
      setShowSignInPrompt(true);
      return;
    }

    const next = !completed;

    // Optimistic update
    setCompleted(next);
    setPending(true);

    try {
      const res = await fetch(`${SERVER_URL}/trpc/progress.toggleSkill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ json: { skillId: id, completed: next } }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      // Refresh server components to pick up new state
      router.refresh();
    } catch {
      // Revert optimistic update
      setCompleted(!next);
      showErrorToast("Could not save progress. Please try again.");
    } finally {
      setPending(false);
    }
  }, [completed, id, isAuthenticated, router]);

  return (
    <div className="my-2 flex items-start gap-3">
      <label
        className={`flex items-center gap-2 text-sm ${
          !isAuthenticated ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={completed}
          disabled={!isAuthenticated || pending}
          onChange={handleToggle}
          className="h-4 w-4 rounded border-fd-border accent-fd-primary disabled:cursor-not-allowed"
          aria-label={`Mark "${label}" as ${completed ? "incomplete" : "complete"}`}
        />
        <span
          className={
            completed
              ? "text-fd-muted-foreground line-through"
              : "text-fd-foreground"
          }
        >
          {label}
        </span>
      </label>

      {showSignInPrompt && !isAuthenticated && (
        <span className="text-xs text-fd-muted-foreground">
          Sign in to track your progress
        </span>
      )}
    </div>
  );
}

function showErrorToast(message: string) {
  // Lightweight toast: render a temporary DOM element
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "1.5rem",
    right: "1.5rem",
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    backgroundColor: "#ef4444",
    color: "#fff",
    fontSize: "0.875rem",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
