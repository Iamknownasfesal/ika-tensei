"use client";

import { useMemo } from "react";

export function BackgroundStars() {
  const stars = useMemo(() => 
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() > 0.8 ? 2 : 1,
      delay: Math.random() * 5,
      duration: 2 + Math.random() * 4,
      color: Math.random() > 0.7 ? "#9b59b6" : Math.random() > 0.5 ? "#3a2850" : "#231832",
    })),
  []);

  return (
    <div className="bg-stars">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        {stars.map((star) => (
          <rect
            key={star.id}
            x={`${star.x}%`}
            y={`${star.y}%`}
            width={star.size}
            height={star.size}
            fill={star.color}
            opacity="0.5"
          >
            <animate
              attributeName="opacity"
              values="0.2;0.8;0.2"
              dur={`${star.duration}s`}
              begin={`${star.delay}s`}
              repeatCount="indefinite"
            />
          </rect>
        ))}
      </svg>
    </div>
  );
}
