export default function RoadmapLoading() {
  return (
    <div className="flex flex-1 flex-col px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 h-4 w-28 animate-pulse rounded bg-fd-secondary" />

        <div className="mb-1 flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-fd-secondary" />
          <div className="h-8 w-28 animate-pulse rounded bg-fd-secondary" />
        </div>

        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-fd-secondary" />

        <div className="my-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-fd-secondary" />
            <div className="h-4 w-8 animate-pulse rounded bg-fd-secondary" />
          </div>
          <div className="h-2 w-full animate-pulse rounded-full bg-fd-secondary" />
        </div>

        <div className="mt-8 flex flex-col gap-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-fd-border bg-fd-card p-5 shadow-sm"
            >
              <div className="mb-3 h-5 w-36 animate-pulse rounded bg-fd-secondary" />
              <div className="h-2 w-full animate-pulse rounded-full bg-fd-secondary" />
              <div className="mt-4 flex flex-col gap-3">
                {[1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="flex items-center justify-between"
                  >
                    <div className="h-4 w-44 animate-pulse rounded bg-fd-secondary" />
                    <div className="h-4 w-4 animate-pulse rounded-full bg-fd-secondary" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
