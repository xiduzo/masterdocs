"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useProgressStore } from "@/lib/progress-store";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

interface Mismatch {
  skillId: string;
  local: boolean;
  server: boolean;
}

type Resolution = Record<string, boolean>;

export function SyncProgressDialog() {
  const { data: session } = useSession();
  const router = useRouter();

  // Select the raw object (stable reference from zustand) — never call
  // methods inside a selector as they return new references each render.
  const completedSkills = useProgressStore((s) => s.completedSkills);
  const clearAll = useProgressStore((s) => s.clearAll);

  const localCompletedIds = useMemo(
    () => Object.keys(completedSkills),
    [completedSkills],
  );
  const hasLocalProgress = localCompletedIds.length > 0;

  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [resolutions, setResolutions] = useState<Resolution>({});
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const checkedRef = useRef(false);

  // When user signs in and has local progress, compare with server
  useEffect(() => {
    if (!session?.user || !hasLocalProgress || checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      try {
        const res = await fetch(
          `${SERVER_URL}/trpc/progress.getAllCompleted`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) return;

        const json = await res.json();
        const serverIds: string[] =
          json?.result?.data?.completedIds ?? [];
        const serverSet = new Set(serverIds);
        const localSet = new Set(localCompletedIds);

        // Find mismatches: skills where local and server disagree
        const allIds = new Set([...serverIds, ...localCompletedIds]);
        const found: Mismatch[] = [];

        for (const id of allIds) {
          const inLocal = localSet.has(id);
          const inServer = serverSet.has(id);
          if (inLocal !== inServer) {
            found.push({ skillId: id, local: inLocal, server: inServer });
          }
        }

        if (found.length === 0) {
          // No mismatches — just clear local storage
          clearAll();
          return;
        }

        // Default resolution: prefer whichever is "completed"
        const defaults: Resolution = {};
        for (const m of found) {
          defaults[m.skillId] = m.local || m.server;
        }

        setMismatches(found);
        setResolutions(defaults);
        setOpen(true);
      } catch {
        // Silently fail — user can still use the app
      }
    })();
  }, [session, hasLocalProgress, localCompletedIds, clearAll]);

  const handleToggle = useCallback((skillId: string) => {
    setResolutions((prev) => ({
      ...prev,
      [skillId]: !prev[skillId],
    }));
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const completedIds: string[] = [];
      const uncompletedIds: string[] = [];

      for (const [skillId, completed] of Object.entries(resolutions)) {
        if (completed) {
          completedIds.push(skillId);
        } else {
          uncompletedIds.push(skillId);
        }
      }

      const res = await fetch(`${SERVER_URL}/trpc/progress.bulkSync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completedIds, uncompletedIds }),
      });

      if (!res.ok) throw new Error("Sync failed");

      clearAll();
      setOpen(false);
      router.refresh();
    } catch {
      // Show inline error
    } finally {
      setSyncing(false);
    }
  }, [resolutions, clearAll, router]);

  const handleDismiss = useCallback(() => {
    clearAll();
    setOpen(false);
  }, [clearAll]);

  if (!open || mismatches.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Sync progress"
    >
      <div className="mx-4 w-full max-w-md rounded-lg border border-fd-border bg-fd-card p-6 shadow-lg">
        <h2 className="mb-2 text-lg font-semibold text-fd-foreground">
          Sync Your Progress
        </h2>
        <p className="mb-4 text-sm text-fd-muted-foreground">
          We found differences between your local progress and your account.
          Choose which state to keep for each skill.
        </p>

        <div className="max-h-64 overflow-y-auto">
          <ul className="flex flex-col gap-2">
            {mismatches.map((m) => (
              <li
                key={m.skillId}
                className="flex items-center justify-between rounded-md border border-fd-border px-3 py-2"
              >
                <span className="text-sm text-fd-foreground truncate mr-3">
                  {m.skillId}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-fd-muted-foreground">
                    {m.local ? "Local: ✓" : "Local: ✗"}
                    {" / "}
                    {m.server ? "Server: ✓" : "Server: ✗"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggle(m.skillId)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      resolutions[m.skillId]
                        ? "bg-fd-primary text-fd-primary-foreground"
                        : "bg-fd-secondary text-fd-muted-foreground"
                    }`}
                    aria-label={`Mark ${m.skillId} as ${resolutions[m.skillId] ? "not completed" : "completed"}`}
                  >
                    {resolutions[m.skillId] ? "Completed" : "Not done"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-foreground hover:bg-fd-accent"
          >
            Keep Server Only
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Apply Choices"}
          </button>
        </div>
      </div>
    </div>
  );
}
