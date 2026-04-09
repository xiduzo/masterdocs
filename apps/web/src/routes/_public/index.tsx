import { Button } from "@masterdocs/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@masterdocs/ui/components/card";
import { Skeleton } from "@masterdocs/ui/components/skeleton";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpenIcon, LogInIcon, PenToolIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_public/")({
  component: HomeComponent,
});

const DOCS_URL = "http://localhost:4000";

function HomeComponent() {
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4">
      <div className="mx-auto w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            masterdocs
          </h1>
          <p className="text-muted-foreground text-lg">
            Interactive learning roadmaps with skill tracking
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <BookOpenIcon className="text-muted-foreground mx-auto size-8" />
              <CardTitle>Browse Docs</CardTitle>
              <CardDescription>
                Explore learning roadmaps and track your progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={DOCS_URL}>
                <Button className="w-full" variant="outline">
                  <BookOpenIcon className="mr-2 size-4" />
                  Open Documentation
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <PenToolIcon className="text-muted-foreground mx-auto size-8" />
              <CardTitle>Content Editor</CardTitle>
              <CardDescription>
                {session
                  ? isAdmin
                    ? "Open the editor to create and manage learning content"
                    : "Your account is signed in, but editor access requires admin role"
                  : "Sign in to create and manage learning content"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : session ? (
                isAdmin ? (
                  <Link to="/admin/content">
                    <Button className="w-full">Open Editor</Button>
                  </Link>
                ) : (
                  <Link to="/dashboard">
                    <Button className="w-full" variant="outline">
                      Open Dashboard
                    </Button>
                  </Link>
                )
              ) : (
                <Link to="/login">
                  <Button className="w-full">
                    <LogInIcon className="mr-2 size-4" />
                    Sign In
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
