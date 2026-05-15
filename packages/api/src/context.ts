import { auth } from "@masterdocs/auth";
import type { Context as HonoContext } from "hono";

import type { ContentRepository } from "./lib/content-repository";
import { getContentRepository } from "./lib/octokit-content-repository";

export interface CreateContextOptions {
  context: HonoContext;
  /**
   * Override the ContentRepository. Defaults to the production Octokit-backed
   * singleton. Tests using `createCallerFactory` typically build their own
   * context object directly and inject a `FakeContentRepository` instead of
   * going through this factory.
   */
  contentRepository?: ContentRepository;
}

export async function createContext({
  context,
  contentRepository,
}: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    session,
    contentRepository: contentRepository ?? getContentRepository(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
