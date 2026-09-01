import { PortraitCard } from "@/components/portrait/PortraitCard";
import { makeFixturePortrait } from "@/lib/portrait/types";

export default function PortraitPreviewPage() {
  const portrait = {
    ...makeFixturePortrait(),
    id: "preview-001",
    session_id: "preview-session",
    generation_provenance_id: "preview-provenance",
    generated_at: new Date().toISOString(),
    status: "generated" as const,
  };

  return (
    <div className="graph-paper min-h-screen px-4 py-8">
      <PortraitCard portrait={portrait} />
    </div>
  );
}
