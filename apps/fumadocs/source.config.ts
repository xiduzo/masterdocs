import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineCollections, defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
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
