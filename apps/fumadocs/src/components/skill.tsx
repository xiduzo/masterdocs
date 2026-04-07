import { headers } from "next/headers";
import { SkillToggle } from "./skill-toggle.client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

interface SkillProps {
  id: string;
  label: string;
}

export async function Skill({ id, label }: SkillProps) {
  let completed = false;
  let isAuthenticated = false;

  try {
    const reqHeaders = await headers();
    const cookie = reqHeaders.get("cookie") ?? "";

    const res = await fetch(
      `${SERVER_URL}/trpc/progress.getSkillStates?input=${encodeURIComponent(
        JSON.stringify({ json: { skillIds: [id] } }),
      )}`,
      {
        headers: { cookie },
        cache: "no-store",
      },
    );

    if (res.ok) {
      const json = await res.json();
      const data = json?.result?.data?.json;
      if (data) {
        isAuthenticated = data.isAuthenticated;
        completed = data.completedIds?.includes(id) ?? false;
      }
    }
  } catch {
    // If the API is unreachable, render as unauthenticated
  }

  return (
    <SkillToggle
      id={id}
      label={label}
      initialCompleted={completed}
      isAuthenticated={isAuthenticated}
    />
  );
}
