import { createFileRoute } from "@tanstack/react-router";

import SignInForm from "@/components/sign-in-form";

export const Route = createFileRoute("/_public/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="mx-auto mt-6 w-full max-w-md">
      <SignInForm />
    </div>
  );
}
