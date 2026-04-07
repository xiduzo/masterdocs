"use client";

interface ProgressBarClientProps {
  completed: number;
  total: number;
  label?: string;
  isAuthenticated: boolean;
}

export function ProgressBarClient({
  completed,
  total,
  label,
  isAuthenticated,
}: ProgressBarClientProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const displayPercentage = isAuthenticated ? percentage : 0;

  return (
    <div className="my-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-fd-muted-foreground">
          {!isAuthenticated
            ? "Sign in to track progress"
            : label ?? "Progress"}
        </span>
        <span className="font-medium text-fd-foreground">
          {displayPercentage}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-fd-secondary">
        <div
          className="h-full rounded-full bg-fd-primary transition-all duration-300"
          style={{ width: `${displayPercentage}%` }}
          role="progressbar"
          aria-valuenow={displayPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            !isAuthenticated
              ? "Sign in to track progress"
              : `${label ?? "Progress"}: ${displayPercentage}%`
          }
        />
      </div>
    </div>
  );
}
