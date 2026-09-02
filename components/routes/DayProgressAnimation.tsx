"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";

export type DayProgressAnimationProps = {
  /** 0 to 1 — how far through the day; the sky gently cross-fades between phases */
  progress: number;
  /** Accent color for progress bar */
  accentColor?: string;
  className?: string;
};

const PHASES = [
  { name: "dawn", top: "#C8DCE8", bottom: "#F5E6D3", range: [-0.15, 0.15, 0.35] },
  { name: "noon", top: "#7BB3D9", bottom: "#DCE5FF", range: [0.25, 0.45, 0.65] },
  { name: "dusk", top: "#E8A87C", bottom: "#F5D9C8", range: [0.55, 0.70, 0.85] },
  { name: "night", top: "#1a1a2e", bottom: "#2d2d5e", range: [0.78, 0.90, 1.15] },
] as const;

/**
 * 16-bit pixel-art horizontal scene.
 * - Traveler walks in place on the left side.
 * - Street scenery scrolls right-to-left in an infinite seamless loop.
 * - Sky phases cross-fade smoothly based on progress.
 */
export function DayProgressAnimation({
  progress,
  accentColor = "var(--cobalt)",
  className,
}: DayProgressAnimationProps) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const [frame, setFrame] = useState(0);

  // 4-frame walk cycle, always running
  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [reduce]);

  const isNight = clamped > 0.75 || clamped < 0.12;

  // Celestial bodies: loop smoothly from 10% to 90% and back over 0..1
  const celestialX = `${10 + 80 * ((1 - Math.cos(clamped * Math.PI)) / 2)}%`;

  function phaseOpacity(phase: (typeof PHASES)[number], t: number) {
    const [start, peak, end] = phase.range;
    if (t < start || t > end) return 0;
    if (t < peak) {
      return (t - start) / (peak - start);
    }
    return 1 - (t - peak) / (end - peak);
  }

  return (
    <div
      className={`relative w-full overflow-hidden border-2 border-ink ${className ?? ""}`}
      style={{ height: "180px" }}
    >
      {/* Sky cross-fade layers */}
      {PHASES.map((phase) => (
        <div
          key={phase.name}
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${phase.top}, ${phase.bottom})`,
            opacity: phaseOpacity(phase, clamped),
            transition: "opacity 1.5s ease-in-out",
          }}
        />
      ))}

      {/* Stars (night only) */}
      <div
        className="absolute inset-0"
        style={{
          opacity: clamped > 0.78 ? Math.min(1, (clamped - 0.78) / 0.12) : clamped < 0.10 ? Math.min(1, (0.10 - clamped) / 0.10) : 0,
          transition: "opacity 1.5s ease-in-out",
        }}
      >
        <svg className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }}>
          {[
            { x: 40, y: 10 }, { x: 120, y: 30 }, { x: 220, y: 18 },
            { x: 340, y: 40 }, { x: 480, y: 22 }, { x: 620, y: 36 },
            { x: 760, y: 14 }, { x: 880, y: 32 }, { x: 1000, y: 20 },
          ].map((s, i) => (
            <rect key={i} x={s.x} y={s.y} width="3" height="3" fill="#FFFFFF" fillOpacity="0.9" />
          ))}
        </svg>
      </div>

      {/* Moon / Sun — smooth left-to-right loop */}
      <div
        className="absolute"
        style={{
          left: celestialX,
          top: "16px",
          transition: "left 1.5s linear",
        }}
      >
        {isNight ? (
          <svg width="32" height="32" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
            <rect x="10" y="6" width="14" height="20" fill="#FFFDF7" />
            <rect x="8" y="8" width="4" height="16" fill="#E8E0D0" />
          </svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
            <rect x="8" y="8" width="16" height="16" fill="#F5E6A8" />
            <rect x="4" y="12" width="4" height="8" fill="#F5D9A8" />
            <rect x="24" y="12" width="4" height="8" fill="#F5D9A8" />
            <rect x="12" y="4" width="8" height="4" fill="#F5D9A8" />
            <rect x="12" y="24" width="8" height="4" fill="#F5D9A8" />
          </svg>
        )}
      </div>

      {/* Clouds drifting */}
      <motion.div
        className="absolute top-4 left-0 right-0 h-20"
        initial={{ x: 0 }}
        animate={{ x: -140 }}
        transition={{ duration: 60, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
      >
        <svg width="120" height="32" viewBox="0 0 120 32" style={{ imageRendering: "pixelated" }}>
          <rect x="8" y="16" width="40" height="8" fill="#FFFFFF" fillOpacity="0.55" />
          <rect x="16" y="8" width="28" height="8" fill="#FFFFFF" fillOpacity="0.55" />
          <rect x="70" y="14" width="4" height="2" fill="#FFFFFF" fillOpacity="0.5" />
          <rect x="76" y="12" width="6" height="2" fill="#FFFFFF" fillOpacity="0.5" />
          <rect x="74" y="14" width="2" height="2" fill="#FFFFFF" fillOpacity="0.5" />
        </svg>
      </motion.div>

      {/* Street scenery — infinite seamless scroll */}
      <div className="absolute bottom-0 left-0 right-0 h-[140px] overflow-hidden">
        <motion.div
          className="absolute bottom-0 h-[140px]"
          style={{
            width: "200%",
            backgroundImage: "url('/sprites/new/street-bottom-muted.png')",
            backgroundRepeat: "repeat-x",
            backgroundPosition: "0 bottom",
            backgroundSize: "auto 140px",
            imageRendering: "pixelated",
          }}
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Traveler — walks in place on the left */}
      <div
        className="absolute z-10"
        style={{
          left: "15%",
          bottom: "16px",
          width: "58px",
          height: "120px",
        }}
      >
        <Image
          src={`/sprites/new/traveler-frame-${frame}.png`}
          alt=""
          width={58}
          height={120}
          className="h-[120px] w-[58px]"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-ink/10">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${clamped * 100}%`, backgroundColor: accentColor }}
        />
      </div>
    </div>
  );
}
