export interface Crumb {
  label: string;
  href?: string;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    crumb?: (params: Record<string, string | undefined>) => Crumb[];
  }
}
