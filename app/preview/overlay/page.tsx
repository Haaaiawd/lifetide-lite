"use client";

import { GenerationOverlay } from "@/components/play/GenerationOverlay";

// Preview the streaming phase: one content section arrives so the overlay
// leaves walking, while the pseudo-thinking card keeps redacted text flowing.
export default function OverlayPreviewPage() {
  return (
    <GenerationOverlay
      variant="final"
      title="三条平行人生"
      subtitle="正在为你设计三条不同的路线……"
      streamingSections={[
        { label: "你的问题", text: "如何在保留现有安全感的同时，验证一条更贴近自己节奏的生活路径。" },
      ]}
      onCancel={() => {}}
    />
  );
}
