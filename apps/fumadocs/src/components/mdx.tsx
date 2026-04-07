import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { Skill } from "./skill";
import { YouTube } from "./youtube";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Skill,
    YouTube,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
