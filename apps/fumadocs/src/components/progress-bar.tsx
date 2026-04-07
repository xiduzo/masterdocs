import { headers } from "next/headers";
import { ProgressBarClient } from "./progress-bar.client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

interface ProgressBarProps {
  skillIds: string[];
  label?: string;
}

export async function ProgressBar({ skillIds, label }: ProgressBarProps) {
  let completed = 0;
  let isAuthenticated = false;

  if (skillIds.length > 0) {
    try {
      const reqHeaders = await headers();
      const cookie = reqHeaders.get("cookie") ?? "";

      const res = await fetch(
        `${SERVER_URL}/trpc/progress.getSkillStates?input=${encodeURIComponent(
          JSON.stringify({ skillIds }),
        )}`,
        {
          headers: { cookie },
          cache: "no-store",
        },
      );

      if (res.ok) {
        const json = await res.json();
        const data = json?.result?.data;
        if (data) {
          isAuthenticated = data.isAuthenticated;
          completed = data.completedIds?.length ?? 0;
        }
      }
    } catch {
      // If the API is unreachable, render as unauthenticated
    }
  }

  return (
    <ProgressBarClient
      completed={completed}
      total={skillIds.length}
      skillIds={skillIds}
      label={label}
      isAuthenticated={isAuthenticated}
    />
  );
}
