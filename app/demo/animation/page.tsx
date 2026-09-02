"use client";

import { useState, useEffect } from "react";
import { DayProgressAnimation } from "@/components/routes/DayProgressAnimation";

export default function AnimationDemo() {
  const [progress, setProgress] = useState(0);

  // Auto-cycle progress 0 → 1 → 0 to show all sky phases
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => (p + 0.015) % 1);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontFamily: "serif", fontSize: "24px", marginBottom: "16px" }}>
        Day Progress Animation Demo
      </h1>
      <DayProgressAnimation progress={progress} />
      <p style={{ marginTop: "12px", fontSize: "14px", color: "#666" }}>
        Progress: {(progress * 100).toFixed(0)}% — 小人在街道上行走，天空从黎明→正午→黄昏→夜晚
      </p>
    </div>
  );
}
