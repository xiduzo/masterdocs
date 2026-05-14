import { createTrpcClient } from "@masterdocs/api/client";
import { env } from "@masterdocs/env/native";
import { Platform } from "react-native";

import { authClient } from "@/lib/auth-client";

export const { queryClient, trpcClient, trpc } = createTrpcClient({
  trpcUrl: `${env.EXPO_PUBLIC_SERVER_URL}/trpc`,
  fetch: (url, options) =>
    fetch(url, {
      ...options,
      // Better Auth Expo forwards the session cookie manually on native.
      credentials: Platform.OS === "web" ? "include" : "omit",
    }),
  headers() {
    if (Platform.OS === "web") return {};
    const cookies = authClient.getCookie();
    return cookies ? { Cookie: cookies } : {};
  },
});
