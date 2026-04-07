import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { AuthButton } from "@/components/auth-button";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        type: "custom",
        children: <AuthButton />,
        secondary: true,
      },
    ],
  };
}
