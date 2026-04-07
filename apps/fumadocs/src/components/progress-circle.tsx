"use client";

interface ProgressCircleProps {
  completed: number;
  total: number;
  /** Circle diameter in pixels. Defaults to 16. */
  size?: number;
  /** Stroke width in pixels. Defaults to 2. */
  strokeWidth?: number;
}

export function ProgressCircle({
  completed,
  total,
  size = 16,
  strokeWidth = 2,
}: ProgressCircleProps) {
  const ratio = total > 0 ? completed / total : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  const isComplete = total > 0 && completed >= total;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-label={`${completed} of ${total} complete`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-fd-muted-foreground/30"
      />
      {ratio > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        //   className={isComplete ? "text-green-500" : "text-fd-primary"}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}
