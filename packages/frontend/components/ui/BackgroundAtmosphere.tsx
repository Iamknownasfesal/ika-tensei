"use client";

import { useEffect, useMemo, useState } from "react";

export type AtmosphereMood = "calm" | "intense" | "mystical" | "warm";

interface AtmosphereProps {
  mood?: AtmosphereMood;
}

// Configuration per mood
const moodConfig = {
  calm: {
    starMultiplier: 0.6,
    kanjiCount: 8,
    kanjiSpeed: 1,
    mistOpacity: 0.12,
    streakChance: 0.3,
    baseTint: "#1a0a2e",
    starTint: "#a5b4fc",
  },
  intense: {
    starMultiplier: 1.4,
    kanjiCount: 18,
    kanjiSpeed: 1.8,
    mistOpacity: 0.22,
    streakChance: 0.8,
    baseTint: "#1f0a1a",
    starTint: "#f472b6",
  },
  mystical: {
    starMultiplier: 1,
    kanjiCount: 22,
    kanjiSpeed: 1.2,
    mistOpacity: 0.25,
    streakChance: 0.5,
    baseTint: "#12081f",
    starTint: "#c084fc",
  },
  warm: {
    starMultiplier: 1.3,
    kanjiCount: 6,
    kanjiSpeed: 0.9,
    mistOpacity: 0.15,
    streakChance: 0.4,
    baseTint: "#1a1208",
    starTint: "#fcd34d",
  },
};

const KANJI_CHARS = ["転", "生", "封", "印", "魂", "霊", "剣", "盾", "冥", "界", "闇", "光", "虚", "無"];

interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleDelay: number;
  twinkleDuration: number;
  color?: string;
}

interface KanjiParticle {
  id: string;
  char: string;
  x: number;
  startY: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function generateStars(layer: 1 | 2 | 3, count: number, mood: AtmosphereMood): Star[] {
  const config = moodConfig[mood];
  const baseCount = layer === 1 ? 40 : layer === 2 ? 25 : 10;
  const actualCount = Math.floor(baseCount * config.starMultiplier);

  return Array.from({ length: actualCount }, (_, i) => {
    const isColored = layer === 3 && Math.random() > 0.5;
    return {
      id: `star-${layer}-${i}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: layer === 1 ? 1 : layer === 2 ? 1 + Math.random() : 2 + Math.random(),
      opacity: layer === 1 ? 0.2 + Math.random() * 0.2 : layer === 2 ? 0.4 + Math.random() * 0.3 : 0.7 + Math.random() * 0.3,
      twinkleDelay: Math.random() * 8,
      twinkleDuration: layer === 1 ? 4 + Math.random() * 4 : 2 + Math.random() * 3,
      color: isColored ? (Math.random() > 0.5 ? "#a855f7" : "#22d3ee") : undefined,
    };
  });
}

function generateKanji(count: number, speed: number): KanjiParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `kanji-${i}`,
    char: KANJI_CHARS[Math.floor(Math.random() * KANJI_CHARS.length)],
    x: 5 + Math.random() * 90,
    startY: -5 + Math.random() * 10,
    size: 16 + Math.random() * 16,
    duration: (8 + Math.random() * 7) / speed,
    delay: Math.random() * 20,
    opacity: 0.05 + Math.random() * 0.1,
  }));
}

export function BackgroundAtmosphere({ mood = "calm" }: AtmosphereProps) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const config = moodConfig[mood];

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Mark mounted
  useEffect(() => setMounted(true), []);

  // Generate particles
  const particles = useMemo(() => {
    const stars1 = generateStars(1, 40, mood);
    const stars2 = generateStars(2, 25, mood);
    const stars3 = generateStars(3, 10, mood);
    const kanji = generateKanji(config.kanjiCount, config.kanjiSpeed);
    return { stars: [...stars1, ...stars2, ...stars3], kanji };
  }, [mood, config.kanjiCount, config.kanjiSpeed]);

  const baseStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
    background: config.baseTint,
  };

  return (
    <div style={baseStyle}>
      {/* Layer 1: Far stars (40 tiny, dim, slow twinkle) */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {particles.stars
          .filter((s) => s.size <= 1)
          .map((star) => (
            <rect
              key={star.id}
              x={`${star.x}%`}
              y={`${star.y}%`}
              width={1}
              height={1}
              fill={star.color || "#fff"}
              opacity={star.opacity}
            >
              {!reducedMotion && (
                <animate
                  attributeName="opacity"
                  values={`${star.opacity * 0.3};${star.opacity};${star.opacity * 0.3}`}
                  dur={`${star.twinkleDuration}s`}
                  begin={`${star.twinkleDelay}s`}
                  repeatCount="indefinite"
                />
              )}
            </rect>
          ))}
      </svg>

      {/* Layer 2: Mid stars (25, 1-2px, medium brightness) */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {particles.stars
          .filter((s) => s.size > 1 && s.size <= 2)
          .map((star) => (
            <rect
              key={star.id}
              x={`${star.x}%`}
              y={`${star.y}%`}
              width={star.size}
              height={star.size}
              fill={star.color || "#fff"}
              opacity={star.opacity}
            >
              {!reducedMotion && (
                <animate
                  attributeName="opacity"
                  values={`${star.opacity * 0.4};${star.opacity};${star.opacity * 0.4}`}
                  dur={`${star.twinkleDuration}s`}
                  begin={`${star.twinkleDelay}s`}
                  repeatCount="indefinite"
                />
              )}
            </rect>
          ))}
      </svg>

      {/* Layer 3: Close stars (10, 2-3px, bright, some purple/cyan) */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {particles.stars
          .filter((s) => s.size > 2)
          .map((star) => (
            <rect
              key={star.id}
              x={`${star.x}%`}
              y={`${star.y}%`}
              width={star.size}
              height={star.size}
              fill={star.color || "#fff"}
              opacity={star.opacity}
            >
              {!reducedMotion && (
                <animate
                  attributeName="opacity"
                  values={`${star.opacity * 0.5};${star.opacity};${star.opacity * 0.5}`}
                  dur={`${star.twinkleDuration}s`}
                  begin={`${star.twinkleDelay}s`}
                  repeatCount="indefinite"
                />
              )}
            </rect>
          ))}
      </svg>

      {/* Floating Kanji */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {particles.kanji.map((k) => (
          <div
            key={k.id}
            className="floating-kanji"
            style={{
              "--kanji-x": `${k.x}%`,
              "--kanji-start": `${k.startY}%`,
              "--kanji-size": `${k.size}px`,
              "--kanji-duration": `${k.duration}s`,
              "--kanji-delay": `${k.delay}s`,
              "--kanji-opacity": k.opacity,
              "--kanji-color": config.starTint,
            } as React.CSSProperties}
          >
            {k.char}
          </div>
        ))}
      </div>

      {/* Ethereal Mist - Bottom 20% */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "20%",
          background: `linear-gradient(to top, rgba(88, 28, 135, ${config.mistOpacity}) 0%, transparent 100%)`,
          animation: reducedMotion ? "none" : "mistDrift 20s ease-in-out infinite alternate",
        }}
      />

      {/* Shooting Streaks */}
      {mounted && !reducedMotion && (
        <ShootingStreak tint={mood === "warm" ? "#fbbf24" : "#22d3ee"} chance={config.streakChance} />
      )}

      {/* Global CSS */}
      <style jsx global>{`
        @keyframes kanjiFloat {
          0% {
            transform: translateY(var(--kanji-start)) translateX(0);
            opacity: 0;
          }
          10% {
            opacity: var(--kanji-opacity);
          }
          90% {
            opacity: var(--kanji-opacity);
          }
          100% {
            transform: translateY(-120vh) translateX(20px);
            opacity: 0;
          }
        }

        .floating-kanji {
          position: absolute;
          left: var(--kanji-x);
          top: 0;
          font-size: var(--kanji-size);
          font-family: "Noto Sans JP", "font-jp", sans-serif;
          color: var(--kanji-color);
          opacity: 0;
          white-space: nowrap;
          animation: kanjiFloat var(--kanji-duration) linear var(--kanji-delay) infinite;
          text-shadow: 0 0 8px var(--kanji-color);
        }

        @keyframes mistDrift {
          0% {
            transform: translateX(-20px);
          }
          100% {
            transform: translateX(20px);
          }
        }
      `}</style>
    </div>
  );
}

function ShootingStreak({ tint, chance }: { tint: string; chance: number }) {
  const [streaks, setStreaks] = useState<{ id: number; x: number; y: number; delay: number }[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < chance * 0.1) {
        const newStreak = {
          id: Date.now(),
          x: Math.random() * 50 + 10,
          y: Math.random() * 40 + 10,
          delay: 0,
        };
        setStreaks((prev) => [...prev.slice(-2), newStreak]);
        setTimeout(() => {
          setStreaks((prev) => prev.filter((s) => s.id !== newStreak.id));
        }, 1500);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [chance]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {streaks.map((streak) => (
        <div
          key={streak.id}
          style={{
            position: "absolute",
            left: `${streak.x}%`,
            top: `${streak.y}%`,
            width: "120px",
            height: "2px",
            background: `linear-gradient(90deg, ${tint}, transparent)`,
            opacity: 0.8,
            animation: "streakFly 1s ease-out forwards",
            boxShadow: `0 0 6px ${tint}, 0 0 12px ${tint}`,
          }}
        />
      ))}
      <style jsx global>{`
        @keyframes streakFly {
          0% {
            transform: translate(0, 0) rotate(-30deg);
            opacity: 1;
          }
          100% {
            transform: translate(-150px, 100px) rotate(-30deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

export default BackgroundAtmosphere;
