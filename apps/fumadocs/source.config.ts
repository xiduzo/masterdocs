import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineCollections, defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

// Extend pageSchema with optional roadmap frontmatter fields.
// When a topic belongs to a roadmap, all five fields should be present.
// Validation of field completeness is handled by roadmap utility functions (Task 12).
const docsSchema = pageSchema.extend({
  roadmap: z.string().optional(),
  track: z.string().optional(),
  trackTitle: z.string().optional(),
  trackOrder: z.number().optional(),
  topicOrder: z.number().optional(),
});

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: docsSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// Roadmap metadata collection — simple MDX files with title and description frontmatter.
// These define top-level roadmap info displayed on the roadmap index page.
export const roadmaps = defineCollections({
  type: "doc",
  dir: "content/roadmaps",
  schema: pageSchema,
});

export default defineConfig({
  mdxOptions: {},
});
