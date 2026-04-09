import { env } from "@masterdocs/env/web";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [
    emailOTPClient(),
    inferAdditionalFields({
      user: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    }),
  ],
});
