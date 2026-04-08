import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGINS: z.string().min(1).transform((val) => val.split(",").map((s) => s.trim())),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    GITHUB_TOKEN: z.string().min(1).optional(),
    GITHUB_OWNER: z.string().min(1).optional(),
    GITHUB_REPO: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
