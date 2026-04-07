"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";

type Step = "email" | "otp";

export default function SignInPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && session?.user) {
      router.replace("/profile");
    }
  }, [session, isPending, router]);

  const handleSendOtp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const { error: sendError } =
          await authClient.emailOtp.sendVerificationOtp({
            email: email.trim(),
            type: "sign-in",
          });
        if (sendError) {
          setError(sendError.message ?? "Failed to send OTP");
        } else {
          setStep("otp");
        }
      } catch {
        setError("Failed to send OTP. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email],
  );

  const handleVerifyOtp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const { error: verifyError } =
          await authClient.signIn.emailOtp({
            email: email.trim(),
            otp: otp.trim(),
          });
        if (verifyError) {
          setError(verifyError.message ?? "Invalid OTP");
        } else {
          router.replace("/profile");
        }
      } catch {
        setError("Verification failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, otp, router],
  );

  if (isPending || session?.user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-32 animate-pulse rounded-md bg-fd-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-start justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-fd-border bg-fd-card p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-fd-foreground">
          Sign In
        </h1>

        {step === "email" ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-3">
            <label
              htmlFor="sign-in-email"
              className="text-sm font-medium text-fd-foreground"
            >
              Email
            </label>
            <input
              id="sign-in-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border border-fd-border bg-fd-background px-3 py-2 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus:ring-2 focus:ring-fd-ring"
              autoComplete="email"
              disabled={loading}
            />
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
            <p className="text-sm text-fd-muted-foreground">
              We sent a code to <strong>{email}</strong>
            </p>
            <label
              htmlFor="sign-in-otp"
              className="text-sm font-medium text-fd-foreground"
            >
              One-time password
            </label>
            <input
              id="sign-in-otp"
              type="text"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter OTP"
              className="rounded-md border border-fd-border bg-fd-background px-3 py-2 text-sm text-fd-foreground placeholder:text-fd-muted-foreground focus:outline-none focus:ring-2 focus:ring-fd-ring"
              autoComplete="one-time-code"
              inputMode="numeric"
              disabled={loading}
            />
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
              }}
              className="text-sm text-fd-muted-foreground hover:text-fd-foreground"
            >
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
