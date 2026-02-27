"use client";

import { useEffect, useState } from "react";

interface SakuraPetalProps {
  delay: number;
  left: number;
  duration: number;
  size: number;
  opacity: number;
}

function SakuraPetal({ delay, left, duration, size, opacity }: SakuraPetalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Stagger animation start
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="absolute top-0 pointer-events-none select-none"
      style={{
        left: `${left}%`,
        opacity: isVisible ? opacity : 0,
        animation: `sakura-fall ${duration}s linear infinite`,
        fontSize: `${size}px`,
        transform: `translateX(${Math.sin(left) * 30}px)`,
      }}
    >
      🌸
    </div>
  );
}

export function SakuraParticles() {
  // Generate random sakura petals
  const petals = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    delay: Math.random() * 25,
    left: Math.random() * 100,
    duration: 15 + Math.random() * 10, // 15-25s
    size: 12 + Math.random() * 12, // 12-24px
    opacity: 0.3 + Math.random() * 0.2, // 0.3-0.5
  }));

  return (
    <>
      <style jsx>{`
        @keyframes sakura-fall {
          0% {
            transform: translateY(-20px) translateX(0) rotate(0deg);
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          95% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(40px) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
      {petals.map((petal) => (
        <SakuraPetal
          key={petal.id}
          delay={petal.delay}
          left={petal.left}
          duration={petal.duration}
          size={petal.size}
          opacity={petal.opacity}
        />
      ))}
    </>
  );
}
