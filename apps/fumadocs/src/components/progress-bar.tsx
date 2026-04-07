import { db } from "@fumadocs-learning/db";
import { skillProgress } from "@fumadocs-learning/db/schema";
import { auth } from "@fumadocs-learning/auth";
import { eq, and, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { ProgressBarClient } from "./progress-bar.client";

interface ProgressBarProps {
  skillIds: string[];
  label?: string;
}

export async function ProgressBar({ skillIds, label }: ProgressBarProps) {
  const session = await auth.api.getSession({ headers: await headers() });

  let completed = 0;
  if (session?.user && skillIds.length > 0) {
    const records = await db.query.skillProgress.findMany({
      where: and(
        eq(skillProgress.userId, session.user.id),
        inArray(skillProgress.skillId, skillIds),
      ),
    });
    completed = records.length;
  }

  return (
    <ProgressBarClient
      completed={completed}
      total={skillIds.length}
      label={label}
      isAuthenticated={!!session?.user}
    />
  );
}
