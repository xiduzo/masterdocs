import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getMDXComponents } from "@/components/mdx";
import { ProgressBar } from "@/components/progress-bar";
import { getTopicNavigation, extractSkillIdsFromPage } from "@/lib/roadmap";
import { gitConfig } from "@/lib/shared";
import { getPageImage, getPageMarkdownUrl, source } from "@/lib/source";

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;

  // Determine if this topic belongs to a roadmap
  const { roadmap, track, topicOrder } = page.data;
  const isRoadmapTopic = !!(roadmap && track && topicOrder != null);

  // Extract skill IDs and navigation for roadmap topics
  const skillIds = isRoadmapTopic ? extractSkillIdsFromPage(page.path) : [];
  const navigation = isRoadmapTopic
    ? getTopicNavigation(roadmap, track, topicOrder)
    : undefined;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/content/docs/${page.path}`}
        />
      </div>
      {isRoadmapTopic && skillIds.length > 0 && (
        <ProgressBar skillIds={skillIds} label="Topic Progress" />
      )}
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      {isRoadmapTopic && navigation && (navigation.prev || navigation.next) && (
        <nav className="mt-6 flex items-center justify-between border-t border-fd-border pt-4">
          {navigation.prev ? (
            <Link
              href={navigation.prev.url}
              className="flex flex-col gap-1 text-sm text-fd-muted-foreground hover:text-fd-foreground"
            >
              <span className="text-xs">Previous</span>
              <span className="font-medium">← {navigation.prev.title}</span>
            </Link>
          ) : (
            <div />
          )}
          {navigation.next ? (
            <Link
              href={navigation.next.url}
              className="flex flex-col items-end gap-1 text-sm text-fd-muted-foreground hover:text-fd-foreground"
            >
              <span className="text-xs">Next</span>
              <span className="font-medium">{navigation.next.title} →</span>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
