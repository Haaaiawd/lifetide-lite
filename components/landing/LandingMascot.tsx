"use client";

import { motion, useReducedMotion } from "motion/react";
import { PixelSpeechBubble } from "@/components/art/PixelSpeechBubble";

export function LandingMascot() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-end gap-3"
    >
      <div className="shrink-0">
        <img
          src="/pixel-assets/sara-walk.gif"
          alt="一个正在原地踏步的 1-bit 像素小人"
          width={64}
          height={64}
          className="pixelated h-16 w-16"
        />
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
      >
        <PixelSpeechBubble width={160} height={80}>
          我先走两步
        </PixelSpeechBubble>
      </motion.div>
    </motion.div>
  );
}
