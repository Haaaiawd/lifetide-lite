"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import Image from "next/image";

/**
 * Minimal walking character on a progress bar.
 * Stripped-down version of DayProgressAnimation — no sky, clouds, or scenery.
 * Just the pixel traveler walking in place on a thin line.
 */
export function WalkProgress({
  progress,
  accentColor = "var(--cobalt)",
  className,
}: {
  progress: number;
  accentColor?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [reduce]);

  return (
    <div className={`relative w-full ${className ?? ""}`} style={{ height: "80px" }}>
      {/* Ground line */}
      <div className="absolute bottom-4 left-0 right-0 h-[2px] bg-ink/20" />

      {/* Filled progress */}
      <div
        className="absolute bottom-4 left-0 h-[2px] transition-all duration-500"
        style={{ width: `${clamped * 100}%`, backgroundColor: accentColor }}
      />

      {/* Traveler — walks in place */}
      <div
        className="absolute z-10"
        style={{
          left: `calc(${clamped * 90}% + 5%)`,
          bottom: "10px",
          width: "36px",
          height: "64px",
          transition: "left 0.3s ease-out",
        }}
      >
        <Image
          src={`/sprites/new/traveler-frame-${frame}.png`}
          alt=""
          width={36}
          height={64}
          className="h-16 w-9"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}
