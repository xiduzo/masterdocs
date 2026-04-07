import { createMDX } from "fumadocs-mdx/next";
import { join } from "node:path";
import { runBuildValidation } from "./validate-roadmap-content.mjs";

const withMDX = createMDX();

// Run roadmap content validation at config load time (during `next build`).
// This validates <Skill> props and skill ID uniqueness before compilation starts.
runBuildValidation(join(process.cwd(), "content/docs"));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

export default withMDX(config);
