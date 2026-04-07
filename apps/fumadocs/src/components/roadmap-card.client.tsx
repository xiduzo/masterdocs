"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useProgressStore } from "@/lib/progress-store";

interface RoadmapCardProps {
  slug: string;
  title: string;
  description: string;
  skillIds: string[];
  serverCompleted: number;
  isAuthenticated: boolean;
}

export function RoadmapCard({
  slug,
  title,
  description,
  skillIds,
  serverCompleted,
  isAuthenticated,
}: RoadmapCardProps) {
  const completedSkills = useProgressStore((s) => s.completedSkills);

  const localCompleted = useMemo(
    () => skillIds.filter((id) => completedSkills[id]).length,
    [skillIds, completedSkills],
  );

  const completed = isAuthenticated ? serverCompleted : localCompleted;
  const total = skillIds.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link
      href={`/roadmaps/${slug}`}
      className="group rounded-lg border border-fd-border bg-fd-card p-5 shadow-sm transition-colors hover:border-fd-primary/50 hover:bg-fd-accent"
    >
      <h2 className="mb-1 text-lg font-semibold text-fd-foreground group-hover:text-fd-primary">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-fd-muted-foreground">{description}</p>
      )}
      {total > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs text-fd-muted-foreground">
            <span>Progress</span>
            <span>{percentage}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fd-secondary">
            <div
              className="h-full rounded-full bg-fd-primary transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
