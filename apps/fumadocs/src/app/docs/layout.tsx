import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { docsOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayout tree={source.getPageTree()} {...docsOptions()}>
      {children}
    </DocsLayout>
  );
}
