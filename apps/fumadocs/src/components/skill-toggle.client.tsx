"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProgressStore } from "@/lib/progress-store";

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
  const [serverCompleted, setServerCompleted] = useState(initialCompleted);
  const [pending, setPending] = useState(false);

  const localCompleted = useProgressStore((s) => s.isCompleted(id));
  const toggleLocal = useProgressStore((s) => s.toggleSkill);

  // Use server state when authenticated, local state when not
  const completed = isAuthenticated ? serverCompleted : localCompleted;

  const handleToggle = useCallback(async () => {
    const next = !completed;

    if (!isAuthenticated) {
      // Store in local storage via zustand
      toggleLocal(id, next);
      return;
    }

    // Authenticated: optimistic update + server call
    setServerCompleted(next);
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

      router.refresh();
    } catch {
      setServerCompleted(!next);
      showErrorToast("Could not save progress. Please try again.");
    } finally {
      setPending(false);
    }
  }, [completed, id, isAuthenticated, router, toggleLocal]);

  return (
    <div className="my-2 flex items-start gap-3">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={completed}
          disabled={pending}
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
    </div>
  );
}

function showErrorToast(message: string) {
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
