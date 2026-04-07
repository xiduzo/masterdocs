import { RootProvider } from "fumadocs-ui/provider/next";

import "./global.css";
import { Inter } from "next/font/google";
import { TRPCProvider } from "@/components/trpc-provider";
import { SyncProgressDialog } from "@/components/sync-progress-dialog";

const inter = Inter({
  subsets: ["latin"],
});

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <TRPCProvider>
          <RootProvider>{children}</RootProvider>
          <SyncProgressDialog />
        </TRPCProvider>
      </body>
    </html>
  );
}
