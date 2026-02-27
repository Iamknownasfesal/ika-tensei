"use client";

import { motion } from "framer-motion";
import React from "react";

type PixelCardProps = {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  glowColor?: string;
};

export function PixelCard({
  children,
  className = "",
  hover = true,
  onClick,
  glowColor,
}: PixelCardProps) {
  const glowStyle = glowColor
    ? {
        borderColor: glowColor,
        boxShadow: `0 0 20px ${glowColor}, 0 0 40px ${glowColor}40`,
      }
    : {};

  const MotionComponent = onClick ? motion.div : motion.div;

  return (
    <MotionComponent
      className={`pixel-card p-4 transition-all duration-200 ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      style={glowStyle}
      whileHover={hover ? { y: -4 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
    >
      {children}
    </MotionComponent>
  );
}
