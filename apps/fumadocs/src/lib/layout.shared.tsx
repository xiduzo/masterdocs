import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { MapIcon } from "lucide-react";

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
        text: "Roadmaps",
        url: "/roadmaps",
        icon: <MapIcon />,
      },
      {
        type: "custom",
        children: <AuthButton />,
        secondary: true,
      },
    ],
  };
}
