"use client";

import { useMemo } from "react";
import { useProgressStore } from "@/lib/progress-store";

interface ProgressBarClientProps {
  completed: number;
  total: number;
  skillIds: string[];
  label?: string;
  isAuthenticated: boolean;
}

export function ProgressBarClient({
  completed,
  total,
  skillIds,
  label,
  isAuthenticated,
}: ProgressBarClientProps) {
  const completedSkills = useProgressStore((s) => s.completedSkills);

  const localCompletedCount = useMemo(
    () => skillIds.filter((id) => completedSkills[id]).length,
    [skillIds, completedSkills],
  );

  const effectiveCompleted = isAuthenticated ? completed : localCompletedCount;
  const percentage =
    total > 0 ? Math.round((effectiveCompleted / total) * 100) : 0;

  return (
    <div className="my-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-fd-muted-foreground">
          {label ?? "Progress"}
        </span>
        <span className="font-medium text-fd-foreground">{percentage}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-fd-secondary">
        <div
          className="h-full rounded-full bg-fd-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label ?? "Progress"}: ${percentage}%`}
        />
      </div>
    </div>
  );
}
