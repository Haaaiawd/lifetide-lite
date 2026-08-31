import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "人生试运行",
  description: "通过几轮短问答，看见三种未来，并试玩其中三天。",
};

export default function HomePage() {
  return <LandingPage />;
}
