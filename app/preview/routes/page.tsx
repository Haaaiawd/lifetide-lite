"use client";

import { RouteCarousel } from "@/components/routes/RouteCarousel";
import { fixtureRoutes } from "@/lib/fixtures";

export default function RoutesPreviewPage() {
  return (
    <div className="graph-paper min-h-screen">
      <RouteCarousel
        routes={fixtureRoutes}
        framing="这是三种可能的展开，不是预测，也不是建议。"
        onNavigate={() => {}}
      />
    </div>
  );
}
