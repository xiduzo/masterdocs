import { Tabs, TabsContent, TabsList, TabsTrigger } from "@fumadocs-learning/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Tabs defaultValue="sign-up" className="mx-auto mt-6 w-full max-w-md">
      <TabsList className="w-full">
        <TabsTrigger value="sign-in">Sign In</TabsTrigger>
        <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
      </TabsList>
      <TabsContent value="sign-in">
        <SignInForm onSwitchToSignUp={() => {}} />
      </TabsContent>
      <TabsContent value="sign-up">
        <SignUpForm onSwitchToSignIn={() => {}} />
      </TabsContent>
    </Tabs>
  );
}
