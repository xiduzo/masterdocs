import { headers } from "next/headers";
import { getAllRoadmaps, getRoadmapStructure } from "@/lib/roadmap";
import { RoadmapCard } from "@/components/roadmap-card.client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

export default async function HomePage() {
  const roadmaps = getAllRoadmaps();

  const roadmapSkills = roadmaps.map((r) => {
    const structure = getRoadmapStructure(r.slug);
    const skillIds = structure
      ? structure.tracks.flatMap((t) => t.topics.flatMap((tp) => tp.skillIds))
      : [];
    return { ...r, skillIds };
  });

  const allSkillIds = roadmapSkills.flatMap((r) => r.skillIds);
  let isAuthenticated = false;
  let serverCompletedSet = new Set<string>();

  if (allSkillIds.length > 0) {
    try {
      const reqHeaders = await headers();
      const cookie = reqHeaders.get("cookie") ?? "";

      const res = await fetch(
        `${SERVER_URL}/trpc/progress.getSkillStates?input=${encodeURIComponent(
          JSON.stringify({ skillIds: allSkillIds }),
        )}`,
        { headers: { cookie }, cache: "no-store" },
      );

      if (res.ok) {
        const json = await res.json();
        const data = json?.result?.data;
        if (data) {
          isAuthenticated = data.isAuthenticated;
          serverCompletedSet = new Set<string>(data.completedIds ?? []);
        }
      }
    } catch {
      // fall through
    }
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fd-foreground">
            Learning Roadmaps
          </h1>
          <a
            href="/docs/welcome"
            className="rounded-md px-3 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground transition-colors"
          >
            Getting Started →
          </a>
        </div>
        <p className="mb-8 text-fd-muted-foreground">
          Choose a roadmap to start your learning journey.
        </p>

        {roadmapSkills.length === 0 ? (
          <p className="text-fd-muted-foreground">
            No roadmaps available yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {roadmapSkills.map((roadmap) => (
              <RoadmapCard
                key={roadmap.slug}
                slug={roadmap.slug}
                title={roadmap.title}
                description={roadmap.description}
                skillIds={roadmap.skillIds}
                serverCompleted={
                  roadmap.skillIds.filter((id) => serverCompletedSet.has(id)).length
                }
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
