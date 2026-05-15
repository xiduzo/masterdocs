import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { AuthButton } from "@/components/auth-button";
import { AuthAvatar } from "@/components/auth-avatar";
import { appName, gitConfig } from "./shared";

const sharedBase = {
  nav: { title: appName },
  githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
} satisfies BaseLayoutProps;

/** Used by HomeLayout (top navbar only, no sidebar) */
export function homeOptions(): BaseLayoutProps {
  return {
    ...sharedBase,
    links: [
      {
        type: "custom",
        children: <AuthAvatar />,
        secondary: true,
      },
    ],
  };
}

/** Used by DocsLayout (has sidebar — auth lives in sidebar footer).
 *  `tree` is supplied by the layout component itself, not here. */
export function docsOptions(): Omit<DocsLayoutProps, "tree"> {
  return {
    ...sharedBase,
    sidebar: {
      footer: <AuthButton />,
    },
  };
}

/** Kept for any layout that hasn't migrated yet */
export function baseOptions(): BaseLayoutProps {
  return homeOptions();
}
