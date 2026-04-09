import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getRoadmapStructure } from "@/lib/roadmap";
import { ProgressBar } from "@/components/progress-bar";
import { TopicRow } from "@/components/topic-row.client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

interface RoadmapViewPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RoadmapViewPage({ params }: RoadmapViewPageProps) {
  const { slug } = await params;
  const roadmap = getRoadmapStructure(slug);

  if (!roadmap) {
    notFound();
  }

  // Collect all skill IDs across the entire roadmap
  const allSkillIds = roadmap.tracks.flatMap((track) =>
    track.topics.flatMap((topic) => topic.skillIds),
  );

  // Fetch server-side completion state for all skills at once
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
      // fall through as unauthenticated
    }
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-sm text-fd-muted-foreground hover:text-fd-foreground"
        >
          ← All Roadmaps
        </Link>

        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fd-foreground">
            {roadmap.title}
          </h1>
          <a
            href={`/docs/${slug}`}
            className="rounded-md px-3 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground transition-colors"
          >
            Getting Started →
          </a>
        </div>
        {roadmap.description && (
          <p className="mb-4 text-fd-muted-foreground">
            {roadmap.description}
          </p>
        )}

        <ProgressBar skillIds={allSkillIds} label="Overall Progress" />

        {roadmap.tracks.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-fd-border bg-fd-card p-8 text-center">
            <p className="text-fd-muted-foreground">
              No content has been added to this roadmap yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-8">
            {roadmap.tracks.map((track) => {
              const trackSkillIds = track.topics.flatMap(
                (topic) => topic.skillIds,
              );

              return (
                <section
                  key={track.slug}
                  className="rounded-lg border border-fd-border bg-fd-card p-5 shadow-sm"
                >
                  <h2 className="mb-1 text-lg font-semibold text-fd-foreground">
                    {track.title}
                  </h2>

                  <ProgressBar skillIds={trackSkillIds} label={track.title} />

                  <ul className="mt-4 flex flex-col gap-2">
                    {track.topics.map((topic) => (
                      <TopicRow
                        key={topic.slug}
                        title={topic.title}
                        url={topic.url}
                        skillIds={topic.skillIds}
                        serverCompleted={
                          topic.skillIds.filter((id) => serverCompletedSet.has(id)).length
                        }
                        isAuthenticated={isAuthenticated}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
