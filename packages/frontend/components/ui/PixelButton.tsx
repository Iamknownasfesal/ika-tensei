"use client";

import { motion } from "framer-motion";
import React from "react";

type PixelButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "warning" | "success" | "dark";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "!py-1 !px-3 text-[10px]",
  md: "!py-2 !px-6 text-xs",
  lg: "!py-3 !px-8 text-sm",
};

const variantClasses = {
  primary: "is-primary",
  warning: "is-warning",
  success: "is-success",
  dark: "is-dark",
};

export function PixelButton({
  children,
  variant = "primary",
  size = "md",
  onClick,
  disabled = false,
  className = "",
}: PixelButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`
        nes-btn ${variantClasses[variant]} ${sizeClasses[size]} font-pixel
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
}
