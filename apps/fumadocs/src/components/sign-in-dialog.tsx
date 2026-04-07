"use client";

import { useState, useCallback, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Step = "email" | "otp";

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          await authClient.emailOtp.verifyEmail({
            email: email.trim(),
            otp: otp.trim(),
          });
        if (verifyError) {
          setError(verifyError.message ?? "Invalid OTP");
        } else {
          onClose();
        }
      } catch {
        setError("Verification failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, otp, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-sm rounded-lg border border-fd-border bg-fd-card p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
      >
        <h2 className="mb-4 text-lg font-semibold text-fd-foreground">
          Sign In
        </h2>

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
