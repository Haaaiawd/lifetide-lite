"use client";

import dynamic from "next/dynamic";

export const VoxelMascotClient = dynamic(
  () => import("./VoxelMascot").then((m) => m.VoxelMascot),
  { ssr: false }
);
