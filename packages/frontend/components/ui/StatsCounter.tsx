"use client";

import React, { useEffect, useState } from "react";

type StatsCounterProps = {
  target: number;
  label: string;
  icon: React.ReactNode;
  duration?: number;
};

export function StatsCounter({
  target,
  label,
  icon,
  duration = 2000,
}: StatsCounterProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const steps = 60;
    const interval = duration / steps;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, interval);

    return () => clearInterval(timer);
  }, [target, duration]);

  return (
    <div className="flex items-center gap-2">
      <div className="text-faded-spirit">{icon}</div>
      <div>
        <span className="font-pixel text-sm text-ritual-gold text-glow-gold">
          {count.toLocaleString()}
        </span>{" "}
        <span className="font-silk text-[10px] text-faded-spirit">
          {label}
        </span>
      </div>
    </div>
  );
}
