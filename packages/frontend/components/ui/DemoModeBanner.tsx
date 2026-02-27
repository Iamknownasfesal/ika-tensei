"use client";

import { useState } from "react";
import { DYNAMIC_ENV_ID } from "@/lib/constants";

interface DemoModeBannerProps {
  className?: string;
}

export function DemoModeBanner({ className = "" }: DemoModeBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Only show if DYNAMIC_ENV_ID is empty (demo mode)
  if (DYNAMIC_ENV_ID || isDismissed) {
    return null;
  }

  return (
    <div
      className={`relative z-50 px-4 py-2 text-center font-silk text-xs text-void-purple ${className}`}
      style={{
        background: "linear-gradient(90deg, #ffd700, #ffaa00)",
        borderBottom: "2px solid #b8860b",
      }}
    >
      <span className="mr-2">🛠</span>
      <span className="font-medium">
        Demo Mode — Connect a real wallet with{" "}
        <a
          href="https://dynamic.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-purple-900"
        >
          Dynamic.xyz
        </a>{" "}
        to get started
      </span>
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-void-purple/60 hover:text-void-purple font-bold px-2"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
