import Link from "next/link";
import { getAllRoadmaps } from "@/lib/roadmap";

export default function RoadmapsPage() {
  const roadmaps = getAllRoadmaps();

  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-fd-foreground">
          Learning Roadmaps
        </h1>
        <p className="mb-8 text-fd-muted-foreground">
          Choose a roadmap to start your learning journey.
        </p>

        {roadmaps.length === 0 ? (
          <p className="text-fd-muted-foreground">
            No roadmaps available yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {roadmaps.map((roadmap) => (
              <Link
                key={roadmap.slug}
                href={`/roadmaps/${roadmap.slug}`}
                className="group rounded-lg border border-fd-border bg-fd-card p-5 shadow-sm transition-colors hover:border-fd-primary/50 hover:bg-fd-accent"
              >
                <h2 className="mb-1 text-lg font-semibold text-fd-foreground group-hover:text-fd-primary">
                  {roadmap.title}
                </h2>
                {roadmap.description && (
                  <p className="text-sm text-fd-muted-foreground">
                    {roadmap.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
