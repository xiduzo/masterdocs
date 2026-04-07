import { db } from "@fumadocs-learning/db";
import { skillProgress } from "@fumadocs-learning/db/schema/index";
import { auth } from "@fumadocs-learning/auth";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { SkillToggle } from "./skill-toggle.client";

interface SkillProps {
  id: string;
  label: string;
}

export async function Skill({ id, label }: SkillProps) {
  const session = await auth.api.getSession({ headers: await headers() });

  let completed = false;
  if (session?.user) {
    const record = await db.query.skillProgress.findFirst({
      where: and(
        eq(skillProgress.userId, session.user.id),
        eq(skillProgress.skillId, id),
      ),
    });
    completed = !!record;
  }

  return (
    <SkillToggle
      id={id}
      label={label}
      initialCompleted={completed}
      isAuthenticated={!!session?.user}
    />
  );
}
