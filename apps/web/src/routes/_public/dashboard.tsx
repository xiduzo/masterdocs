import { Card, CardContent, CardHeader, CardTitle } from "@fumadocs-learning/ui/components/card";
import { Skeleton } from "@fumadocs-learning/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_public/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  const privateData = useQuery(trpc.privateData.queryOptions());

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>Welcome {session.data?.user.name}</p>
          {privateData.isLoading ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <p className="text-muted-foreground">API: {privateData.data?.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
