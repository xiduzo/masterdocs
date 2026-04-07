import { expo } from "@better-auth/expo";
import { createDb } from "@fumadocs-learning/db";
import * as schema from "@fumadocs-learning/db/schema/auth";
import { env } from "@fumadocs-learning/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      "fumadocs-learning://",
      ...(env.NODE_ENV === "development"
        ? ["exp://", "exp://**", "exp://192.168.*.*:*/**", "http://localhost:8081"]
        : []),
    ],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Default the user's name to their email on account creation (Req 3.3)
            if (!user.name && user.email) {
              return { data: { ...user, name: user.email } };
            }
            return { data: user };
          },
        },
      },
    },
    plugins: [
      expo(),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          // In development, log the OTP to the console
          if (env.NODE_ENV === "development") {
            console.log(`[DEV] OTP for ${email} (${type}): ${otp}`);
            return;
          }
          // TODO: Integrate a production email provider (e.g., Resend, SendGrid)
          console.log(`OTP requested for ${email} (${type})`);
        },
        otpLength: 6,
        expiresIn: 300,
      }),
    ],
  });
}

export const auth = createAuth();
