"use client";

import { motion } from "framer-motion";
import React from "react";

type PixelProgressProps = {
  value: number;
  label?: string;
  variant?: "primary" | "success" | "warning";
};

const variantColors = {
  primary: "bg-blood-pink",
  success: "bg-spectral-green",
  warning: "bg-ritual-gold",
};

const variantGlows = {
  primary: "shadow-[0_0_10px_#ff3366]",
  success: "shadow-[0_0_10px_#00ff88]",
  warning: "shadow-[0_0_10px_#ffd700]",
};

export function PixelProgress({
  value,
  label,
  variant = "primary",
}: PixelProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const colorClass = variantColors[variant];
  const glowClass = variantGlows[variant];

  return (
    <div className="w-full">
      {(label || true) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <span className="font-silk text-xs text-faded-spirit">{label}</span>
          )}
          <span className="font-pixel text-xs text-ritual-gold">
            {Math.round(clampedValue)}%
          </span>
        </div>
      )}
      <div className="w-full h-6 border-2 border-faded-spirit/40 bg-void-purple/80 relative overflow-hidden">
        <motion.div
          className={`h-full ${colorClass} ${glowClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
