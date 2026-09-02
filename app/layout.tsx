import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GlobalNav } from "@/components/GlobalNav";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "人生试运行 · Lifetide Lite",
  description: "通过几轮短问答，看见三种未来，并试玩其中三天。",
  icons: {
    icon: "/favicon.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="graph-paper text-ink antialiased">
        <Providers>
          <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b-2 border-ink/10 bg-paper/90 px-4 backdrop-blur-sm md:px-6">
            <BrandMark />
            <GlobalNav />
          </header>
          <main className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
