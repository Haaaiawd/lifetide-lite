import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "人生试运行",
  description: "通过几轮短问答，看见三种未来，并试玩其中三天。",
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
          <main className="mx-auto min-h-[100dvh] w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
