import { useState } from "react";

import { Button } from "@masterdocs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@masterdocs/ui/components/card";
import { Field, FieldError } from "@masterdocs/ui/components/field";
import { Input } from "@masterdocs/ui/components/input";
import { Label } from "@masterdocs/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm() {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  const emailForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setIsSending(true);
      try {
        const { error } = await authClient.emailOtp.sendVerificationOtp({
          email: value.email,
          type: "sign-in",
        });
        if (error) {
          toast.error(error.message || error.statusText);
          return;
        }
        setEmail(value.email);
        setStep("otp");
        toast.success("Verification code sent to your email");
      } finally {
        setIsSending(false);
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
      }),
    },
  });

  const otpForm = useForm({
    defaultValues: { otp: "" },
    onSubmit: async ({ value }) => {
      await authClient.signIn.emailOtp(
        { email, otp: value.otp },
        {
          onSuccess: () => {
            navigate({ to: "/dashboard" });
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        otp: z.string().length(6, "Enter the 6-digit code"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <Card className="mx-auto w-full mt-10 max-w-md">
      <CardHeader>
        <CardTitle className="text-center text-3xl font-bold">
          {step === "email" ? "Sign In" : "Enter Code"}
        </CardTitle>
        <CardDescription className="text-center">
          {step === "email"
            ? "We'll send a verification code to your email"
            : `Enter the 6-digit code sent to ${email}`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              emailForm.handleSubmit();
            }}
            className="space-y-4"
          >
            <emailForm.Field name="email">
              {(field) => (
                <Field>
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </emailForm.Field>

            <Button type="submit" className="w-full" disabled={isSending}>
              {isSending ? "Sending..." : "Send Code"}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              otpForm.handleSubmit();
            }}
            className="space-y-4"
          >
            <otpForm.Field name="otp">
              {(field) => (
                <Field>
                  <Label htmlFor={field.name}>Verification Code</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </otpForm.Field>

            <otpForm.Subscribe
              selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? "Verifying..." : "Verify & Sign In"}
                </Button>
              )}
            </otpForm.Subscribe>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setStep("email")}
            >
              Use a different email
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
