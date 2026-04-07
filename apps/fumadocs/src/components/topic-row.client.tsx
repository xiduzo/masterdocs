"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useProgressStore } from "@/lib/progress-store";
import { ProgressCircle } from "./progress-circle";

interface TopicRowProps {
  title: string;
  url: string;
  skillIds: string[];
  serverCompleted: number;
  isAuthenticated: boolean;
}

export function TopicRow({
  title,
  url,
  skillIds,
  serverCompleted,
  isAuthenticated,
}: TopicRowProps) {
  const completedSkills = useProgressStore((s) => s.completedSkills);

  const localCompleted = useMemo(
    () => skillIds.filter((id) => completedSkills[id]).length,
    [skillIds, completedSkills],
  );

  const completed = isAuthenticated ? serverCompleted : localCompleted;
  const total = skillIds.length;

  return (
    <li className="flex items-center justify-between">
      <Link
        href={url}
        className="text-sm text-fd-primary underline-offset-4 hover:underline"
      >
        {title}
      </Link>
      {total > 0 && (
        <ProgressCircle completed={completed} total={total} />
      )}
    </li>
  );
}
