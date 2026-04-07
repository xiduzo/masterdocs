import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoadmapStructure } from "@/lib/roadmap";
import { ProgressBar } from "@/components/progress-bar";

interface RoadmapViewPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RoadmapViewPage({ params }: RoadmapViewPageProps) {
  const { slug } = await params;
  const roadmap = getRoadmapStructure(slug);

  if (!roadmap) {
    notFound();
  }

  // Collect all skill IDs across the entire roadmap for the overall progress bar
  const allSkillIds = roadmap.tracks.flatMap((track) =>
    track.topics.flatMap((topic) => topic.skillIds),
  );

  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/roadmaps"
          className="mb-4 inline-flex items-center text-sm text-fd-muted-foreground hover:text-fd-foreground"
        >
          ← All Roadmaps
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-fd-foreground">
          {roadmap.title}
        </h1>
        {roadmap.description && (
          <p className="mb-4 text-fd-muted-foreground">
            {roadmap.description}
          </p>
        )}

        <ProgressBar skillIds={allSkillIds} label="Overall Progress" />

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
                    <li key={topic.slug}>
                      <Link
                        href={topic.url}
                        className="text-sm text-fd-primary underline-offset-4 hover:underline"
                      >
                        {topic.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
