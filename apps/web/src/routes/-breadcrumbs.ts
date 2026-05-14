export interface Crumb {
  label: string;
  href?: string;
}

export function slugToTitle(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    crumb?: (params: Record<string, string | undefined>) => Crumb[];
  }
}
