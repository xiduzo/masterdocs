import { HomeLayout } from "fumadocs-ui/layouts/home";

import { homeOptions } from "@/lib/layout.shared";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HomeLayout {...homeOptions()}>{children}</HomeLayout>;
}
