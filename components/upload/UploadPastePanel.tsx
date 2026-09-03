"use client";

import { useRouter } from "next/navigation";
import { MaterialCard, type Material } from "@/components/play/MaterialCard";

/**
 * Standalone upload + paste panel for the /play/upload page.
 * Wraps MaterialCard with navigation back to /play after submit or skip.
 */
export function UploadPastePanel() {
  const router = useRouter();

  const handleSubmit = (material: Material) => {
    // MaterialCard already uploaded files to the server and registered them.
    // Just navigate back to /play.
    router.push("/play");
  };

  const handleSkip = () => {
    router.push("/play");
  };

  return (
    <div className="w-full max-w-md">
      <MaterialCard onSubmit={handleSubmit} onSkip={handleSkip} />
    </div>
  );
}
