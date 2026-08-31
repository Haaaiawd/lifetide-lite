"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { PixelSpeechBubble } from "@/components/art/PixelSpeechBubble";

const COLORS = {
  skin: "#F5C4A8",
  shirt: "#2457E6",
  pants: "#3E3E3E",
  shoes: "#171717",
  hair: "#171717",
};

function VoxelBox({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} flatShading roughness={0.6} />
    </mesh>
  );
}

function Character() {
  const bodyGroup = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 6;
    const stride = 0.55;

    if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(t) * stride;
    if (rightLeg.current) rightLeg.current.rotation.x = Math.sin(t + Math.PI) * stride;
    if (leftArm.current) leftArm.current.rotation.x = Math.sin(t + Math.PI) * stride;
    if (rightArm.current) rightArm.current.rotation.x = Math.sin(t) * stride;

    if (bodyGroup.current) {
      bodyGroup.current.position.y = Math.abs(Math.sin(t)) * 0.12;
    }
  });

  return (
    <group ref={bodyGroup} position={[0, -1.2, 0]} scale={0.6}>
      {/* Left leg */}
      <group ref={leftLeg} position={[-0.7, 1.5, 0]}>
        <VoxelBox position={[0, 0, 0]} size={[0.9, 3, 0.9]} color={COLORS.pants} />
        <VoxelBox position={[0, -1.4, 0]} size={[1, 0.6, 1.1]} color={COLORS.shoes} />
      </group>

      {/* Right leg */}
      <group ref={rightLeg} position={[0.7, 1.5, 0]}>
        <VoxelBox position={[0, 0, 0]} size={[0.9, 3, 0.9]} color={COLORS.pants} />
        <VoxelBox position={[0, -1.4, 0]} size={[1, 0.6, 1.1]} color={COLORS.shoes} />
      </group>

      {/* Body */}
      <VoxelBox position={[0, 4.2, 0]} size={[2.8, 3.6, 1.6]} color={COLORS.shirt} />

      {/* Arms */}
      <group ref={leftArm} position={[-1.8, 5.4, 0]}>
        <VoxelBox position={[0, -0.8, 0]} size={[0.8, 2.8, 0.8]} color={COLORS.skin} />
        <VoxelBox position={[0, -2, 0]} size={[0.85, 0.9, 0.85]} color={COLORS.shirt} />
      </group>
      <group ref={rightArm} position={[1.8, 5.4, 0]}>
        <VoxelBox position={[0, -0.8, 0]} size={[0.8, 2.8, 0.8]} color={COLORS.skin} />
        <VoxelBox position={[0, -2, 0]} size={[0.85, 0.9, 0.85]} color={COLORS.shirt} />
      </group>

      {/* Head */}
      <group position={[0, 6.6, 0]}>
        <VoxelBox position={[0, 0, 0]} size={[2.4, 2.4, 2.2]} color={COLORS.skin} />
        {/* Hair */}
        <VoxelBox position={[0, 1.3, 0]} size={[2.6, 0.7, 2.4]} color={COLORS.hair} />
        <VoxelBox position={[0, 0.2, -0.7]} size={[2.6, 2.0, 0.6]} color={COLORS.hair} />
        {/* Eyes */}
        <VoxelBox position={[-0.5, 0.1, 1.15]} size={[0.3, 0.3, 0.05]} color={COLORS.shoes} />
        <VoxelBox position={[0.5, 0.1, 1.15]} size={[0.3, 0.3, 0.05]} color={COLORS.shoes} />
      </group>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[5, 10, 7]} intensity={1.1} />
      <Character />
      <Html position={[2.4, 3.2, 0]} transform={false}>
        <PixelSpeechBubble width={180} height={85}>
          我先走两步
        </PixelSpeechBubble>
      </Html>
    </>
  );
}

export function VoxelMascot() {
  return (
    <div className="h-48 w-full md:h-64">
      <Canvas
        camera={{ position: [6, 4, 16], fov: 28 }}
        gl={{ antialias: false }}
      >
        <color attach="background" args={["#F5F0E6"]} />
        <Scene />
      </Canvas>
    </div>
  );
}
