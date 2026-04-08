import { protectedProcedure, publicProcedure, router } from "../index";
import { contentRouter } from "./content";
import { progressRouter } from "./progress";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  progress: progressRouter,
  content: contentRouter,
});
export type AppRouter = typeof appRouter;
