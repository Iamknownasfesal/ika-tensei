"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";

// Color palette
const COLORS = {
  voidPurple: "#0d0a1a",
  bloodPink: "#ff3366",
  ritualGold: "#ffd700",
  mysticPurple: "#9b59b6",
  soulCyan: "#00ccff",
  sigilBorder: "#3a2850",
  idleFill: "#231832",
};

// Elder Futhark runes
const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛋᛏᛒᛖᛗᛚᛝᛞᛟ";

export type CirclePhase = "idle" | "charging" | "active" | "overload";

export interface SummoningCircleProps {
  phase?: CirclePhase;
  size?: number;
  /** Intensity level 0-1, increases visual intensity */
  intensity?: number;
  /** Enable interactive hover/click states */
  interactive?: boolean;
  /** Callback when phase changes (for interactive mode) */
  onPhaseChange?: (phase: CirclePhase) => void;
}

// Flower of Life pattern generator
const generateFlowerOfLife = (cx: number, cy: number, radius: number, layers: number) => {
  const circles: { cx: number; cy: number; r: number }[] = [];
  circles.push({ cx, cy, r: radius });
  for (let layer = 1; layer <= layers; layer++) {
    const count = layer * 6;
    const r = radius / layer;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = (radius * layer) / layers;
      circles.push({
        cx: cx + dist * Math.cos(angle),
        cy: cy + dist * Math.sin(angle),
        r: r * 0.8,
      });
    }
  }
  return circles;
};

// Metatron's Cube - 13 circles arrangement
const generateMetatronCube = (cx: number, cy: number, radius: number) => {
  const circles: { cx: number; cy: number; r: number }[] = [];
  circles.push({ cx, cy, r: radius * 0.15 });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    circles.push({
      cx: cx + radius * 0.5 * Math.cos(angle),
      cy: cy + radius * 0.5 * Math.sin(angle),
      r: radius * 0.15,
    });
  }
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    circles.push({
      cx: cx + radius * Math.cos(angle),
      cy: cy + radius * Math.sin(angle),
      r: radius * 0.12,
    });
  }
  return circles;
};

export function SummoningCircle({ 
  phase: initialPhase, 
  size = 400, 
  intensity = 0.5,
  interactive = false,
  onPhaseChange 
}: SummoningCircleProps) {
  const [autoPhase, setAutoPhase] = useState<CirclePhase>(initialPhase || "idle");
  const [hovered, setHovered] = useState(false);
  const [particlePositions, setParticlePositions] = useState<{ x: number; y: number }[]>([]);
  
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.48;
  
  // Use prop phase or internal state
  const phase = initialPhase !== undefined ? initialPhase : autoPhase;
  
  // Phase auto-cycling (only when not controlled)
  useEffect(() => {
    if (initialPhase !== undefined) return;
    
    const cycle: CirclePhase[] = ["idle", "charging", "active", "overload"];
    const delays = [5000, 3000, 4000, 2000];
    const currentIndex = cycle.indexOf(autoPhase);
    
    const timeout = setTimeout(() => {
      setAutoPhase(cycle[(currentIndex + 1) % cycle.length]);
      onPhaseChange?.(cycle[(currentIndex + 1) % cycle.length]);
    }, delays[currentIndex]);
    
    return () => clearTimeout(timeout);
  }, [autoPhase, initialPhase, onPhaseChange]);
  
  // Update particles
  useEffect(() => {
    const interval = setInterval(() => {
      const positions: { x: number; y: number }[] = [];
      const ringCount = phase === "overload" ? 5 : phase === "active" ? 4 : 2;
      
      for (let ring = 0; ring < ringCount; ring++) {
        const radius = maxRadius * (0.3 + ring * 0.15);
        const count = 8 + ring * 4;
        const offset = Date.now() / (1000 + ring * 500) * (ring % 2 === 0 ? 1 : -1);
        
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + offset;
          positions.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
          });
        }
      }
      
      setParticlePositions(positions);
    }, 50);
    
    return () => clearInterval(interval);
  }, [phase, cx, cy, maxRadius]);
  
  // Calculate speeds based on phase
  const speeds = useMemo(() => {
    const baseMultiplier = phase === "idle" ? 1 : 
                           phase === "charging" ? 2 : 
                           phase === "active" ? 4 : 8;
    return {
      outer: 60 / baseMultiplier,
      middle: 45 / baseMultiplier,
      inner: 30 / baseMultiplier,
      pentacle: 25 / baseMultiplier,
    };
  }, [phase]);
  
  // Get colors based on phase
  const getPhaseColors = () => {
    switch (phase) {
      case "charging":
        return {
          border: COLORS.ritualGold,
          fill: COLORS.idleFill,
          rune: COLORS.ritualGold,
          center: COLORS.ritualGold,
          glow: COLORS.ritualGold,
          secondary: COLORS.mysticPurple,
          accent: COLORS.soulCyan,
        };
      case "active":
        return {
          border: COLORS.bloodPink,
          fill: COLORS.voidPurple,
          rune: COLORS.ritualGold,
          center: COLORS.soulCyan,
          glow: COLORS.bloodPink,
          secondary: COLORS.ritualGold,
          accent: COLORS.soulCyan,
        };
      case "overload":
        return {
          border: "#ffffff",
          fill: COLORS.bloodPink,
          rune: "#ffffff",
          center: COLORS.ritualGold,
          glow: "#ffffff",
          secondary: COLORS.bloodPink,
          accent: COLORS.ritualGold,
        };
      default:
        return {
          border: COLORS.sigilBorder,
          fill: COLORS.idleFill,
          rune: COLORS.sigilBorder,
          center: COLORS.mysticPurple,
          glow: COLORS.mysticPurple,
          secondary: "#3a2850",
          accent: COLORS.soulCyan,
        };
    }
  };
  
  const colors = getPhaseColors();
  const isIntense = hovered || phase !== "idle" || intensity > 0.7;
  
  // Generate sacred geometry
  const flowerOfLife = useMemo(() => generateFlowerOfLife(cx, cy, maxRadius * 0.25, 2), [cx, cy, maxRadius]);
  const metatronCircles = useMemo(() => generateMetatronCube(cx, cy, maxRadius * 0.35), [cx, cy, maxRadius]);
  
  // Generate lightning arc positions
  const lightningArcs = useMemo(() => {
    if (phase === "idle") return [];
    
    const arcs: { x1: number; y1: number; x2: number; y2: number; delay: number }[] = [];
    const numArcs = phase === "overload" ? 8 : phase === "active" ? 5 : 2;
    
    for (let i = 0; i < numArcs; i++) {
      const angle1 = (i / numArcs) * Math.PI * 2;
      const angle2 = angle1 + Math.PI / 3;
      arcs.push({
        x1: cx + maxRadius * 0.6 * Math.cos(angle1),
        y1: cy + maxRadius * 0.6 * Math.sin(angle1),
        x2: cx + maxRadius * 0.85 * Math.cos(angle2),
        y2: cy + maxRadius * 0.85 * Math.sin(angle2),
        delay: i * 0.1,
      });
    }
    
    return arcs;
  }, [phase, cx, cy, maxRadius]);
  
  // Handle click for interactive mode
  const handleClick = () => {
    if (!interactive || initialPhase !== undefined) return;
    
    const cycle: CirclePhase[] = ["idle", "charging", "active", "overload"];
    const next = cycle[(cycle.indexOf(autoPhase) + 1) % cycle.length];
    setAutoPhase(next);
    onPhaseChange?.(next);
  };

  // Pulse animation for center
  const pulseDuration = phase === "overload" ? 0.2 : phase === "active" ? 0.4 : phase === "charging" ? 0.8 : 2;
  const shakeClass = phase === "overload" ? "animate-shake" : "";

  return (
    <div 
      className={`relative ${interactive ? "cursor-pointer" : ""} ${shakeClass}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
      onClick={handleClick}
    >
      {/* Background void */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${COLORS.voidPurple} 0%, transparent 70%)`,
        }}
      />
      
      {/* Phase indicator ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: isIntense
            ? `0 0 ${size * 0.15}px ${colors.glow}44, inset 0 0 ${size * 0.2}px ${colors.glow}22`
            : `0 0 ${size * 0.05}px ${colors.glow}22`,
        }}
        transition={{ duration: 0.5 }}
      />

      {/* ===== RING 1: Outer dashed circle with runes (counter-clockwise) ===== */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        animate={{ rotate: -360 }}
        transition={{ duration: speeds.outer, repeat: Infinity, ease: "linear" }}
      >
        {/* Outer dashed ring */}
        <circle
          cx={cx}
          cy={cy}
          r={maxRadius}
          fill="none"
          stroke={colors.border}
          strokeWidth="2"
          strokeDasharray="8 6"
          opacity={phase === "idle" ? 0.4 : 0.8}
        />
        
        {/* Rune characters around outer ring */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
          const x = cx + maxRadius * 0.92 * Math.cos(angle);
          const y = cy + maxRadius * 0.92 * Math.sin(angle);
          
          return (
            <motion.text
              key={`rune-${i}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isIntense ? colors.rune : colors.secondary}
              fontSize={size * 0.04}
              fontFamily="serif"
              initial={{ opacity: 0.3 }}
              animate={{
                opacity: isIntense
                  ? [0.5, 1, 0.5]
                  : [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 2 + (i % 3) * 0.5,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            >
              {RUNES[i]}
            </motion.text>
          );
        })}
        
        {/* Outer tick marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = (i / 36) * Math.PI * 2 - Math.PI / 2;
          const innerR = maxRadius * 0.9;
          const outerR = maxRadius * (i % 3 === 0 ? 0.95 : 0.92);
          
          return (
            <line
              key={`tick-${i}`}
              x1={cx + innerR * Math.cos(angle)}
              y1={cy + innerR * Math.sin(angle)}
              x2={cx + outerR * Math.cos(angle)}
              y2={cy + outerR * Math.sin(angle)}
              stroke={colors.border}
              strokeWidth={i % 3 === 0 ? 2 : 1}
              opacity={isIntense ? 0.6 : 0.2}
            />
          );
        })}
      </motion.svg>

      {/* ===== RING 2: Thin counter-rotating ring ===== */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: speeds.middle, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={maxRadius * 0.82}
          fill="none"
          stroke={colors.border}
          strokeWidth="1"
          strokeDasharray="4 12"
          opacity={phase === "idle" ? 0.3 : 0.7}
        />
      </motion.svg>

      {/* ===== RING 3: Flower of Life (sacred geometry) ===== */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: speeds.middle * 1.2, repeat: Infinity, ease: "linear" }}
      >
        {/* Flower of Life pattern */}
        <g opacity={isIntense ? 0.4 : 0.15}>
          {flowerOfLife.map((circle, i) => (
            <circle
              key={`fol-${i}`}
              cx={circle.cx}
              cy={circle.cy}
              r={circle.r}
              fill="none"
              stroke={colors.secondary}
              strokeWidth="0.5"
            />
          ))}
        </g>
      </motion.svg>

      {/* ===== RING 4: Metatron's Cube ===== */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        animate={{ rotate: -360 }}
        transition={{ duration: speeds.middle * 1.5, repeat: Infinity, ease: "linear" }}
      >
        <g opacity={isIntense ? 0.5 : 0.2}>
          {metatronCircles.map((circle, i) => (
            <circle
              key={`meta-${i}`}
              cx={circle.cx}
              cy={circle.cy}
              r={circle.r}
              fill="none"
              stroke={colors.accent}
              strokeWidth="0.5"
            />
          ))}
          {/* Connecting lines */}
          {metatronCircles.slice(1).map((circle, i) => (
            <line
              key={`meta-line-${i}`}
              x1={cx}
              y1={cy}
              x2={circle.cx}
              y2={circle.cy}
              stroke={colors.accent}
              strokeWidth="0.3"
              opacity={0.3}
            />
          ))}
        </g>
      </motion.svg>

      {/* ===== RING 5: Hexagram (two overlapping triangles, counter-rotating) ===== */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        animate={{ rotate: -360 }}
        transition={{ duration: speeds.inner, repeat: Infinity, ease: "linear" }}
      >
        {/* Triangle 1 (pointing up) */}
        <polygon
          points={Array.from({ length: 3 }).map((_, i) => {
            const angle = (i * 120 - 90) * (Math.PI / 180);
            return `${cx + maxRadius * 0.65 * Math.cos(angle)},${cy + maxRadius * 0.65 * Math.sin(angle)}`;
          }).join(" ")}
          fill="none"
          stroke={colors.border}
          strokeWidth="1.5"
          opacity={phase === "idle" ? 0.4 : 0.8}
        />
        
        {/* Triangle 2 (pointing down) */}
        <polygon
          points={Array.from({ length: 3 }).map((_, i) => {
            const angle = (i * 120 + 90) * (Math.PI / 180);
            return `${cx + maxRadius * 0.65 * Math.cos(angle)},${cy + maxRadius * 0.65 * Math.sin(angle)}`;
          }).join(" ")}
          fill="none"
          stroke={colors.border}
          strokeWidth="1.5"
          opacity={phase === "idle" ? 0.4 : 0.8}
        />
      </motion.svg>

      {/* ===== RING 6: Pentacle (5-pointed star inside circle) ===== */}
      <motion.svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: speeds.pentacle, repeat: Infinity, ease: "linear" }}
      >
        {/* Circle around pentagram */}
        <circle
          cx={cx}
          cy={cy}
          r={maxRadius * 0.48}
          fill="none"
          stroke={colors.border}
          strokeWidth="1.5"
          opacity={phase === "idle" ? 0.5 : 0.9}
        />
        
        {/* Pentagram */}
        <polygon
          points={Array.from({ length: 5 }).map((_, i) => {
            const angle = (i * 72 - 90) * (Math.PI / 180);
            return `${cx + maxRadius * 0.48 * Math.cos(angle)},${cy + maxRadius * 0.48 * Math.sin(angle)}`;
          }).join(" ")}
          fill="none"
          stroke={colors.border}
          strokeWidth="2"
          opacity={phase === "idle" ? 0.4 : 0.8}
        />
        
        {/* Connect all points */}
        {Array.from({ length: 5 }).map((_, i) => {
          const angle1 = (i * 72 - 90) * (Math.PI / 180);
          const angle2 = ((i + 2) * 72 - 90) * (Math.PI / 180);
          return (
            <line
              key={`pent-line-${i}`}
              x1={cx + maxRadius * 0.48 * Math.cos(angle1)}
              y1={cy + maxRadius * 0.48 * Math.sin(angle1)}
              x2={cx + maxRadius * 0.48 * Math.cos(angle2)}
              y2={cy + maxRadius * 0.48 * Math.sin(angle2)}
              stroke={colors.border}
              strokeWidth="1.5"
              opacity={phase === "idle" ? 0.4 : 0.8}
            />
          );
        })}
      </motion.svg>

      {/* ===== ENERGY PARTICLES ===== */}
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 pointer-events-none">
        {particlePositions.map((pos, i) => (
          <motion.circle
            key={`particle-${i}`}
            cx={pos.x}
            cy={pos.y}
            r={phase === "overload" ? 3 : phase === "active" ? 2.5 : 2}
            fill={i % 3 === 0 ? colors.accent : colors.border}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{
              duration: phase === "overload" ? 0.3 : phase === "active" ? 0.5 : 0.8,
              repeat: Infinity,
              delay: i * 0.02,
            }}
          />
        ))}
      </svg>
      
      {/* ===== LIGHTNING ARCS ===== */}
      <AnimatePresence>
        {lightningArcs.length > 0 && (
          <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 pointer-events-none">
            {lightningArcs.map((arc, i) => (
              <motion.path
                key={`arc-${i}`}
                d={`M ${arc.x1} ${arc.y1} Q ${(arc.x1 + arc.x2) / 2 + (Math.random() - 0.5) * 30} ${(arc.y1 + arc.y2) / 2 + (Math.random() - 0.5) * 30} ${arc.x2} ${arc.y2}`}
                fill="none"
                stroke={colors.accent}
                strokeWidth="1.5"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: [0, 1, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: phase === "overload" ? 0.15 : 0.3,
                  repeat: Infinity,
                  delay: arc.delay,
                  ease: "linear",
                }}
              />
            ))}
          </svg>
        )}
      </AnimatePresence>

      {/* ===== RING 7: Center glowing orb ===== */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="rounded-full"
          style={{
            width: maxRadius * 0.35,
            height: maxRadius * 0.35,
            background: `radial-gradient(circle, ${
              phase === "overload" 
                ? "#ffffff" 
                : phase === "active" 
                  ? COLORS.bloodPink 
                  : phase === "charging"
                    ? COLORS.ritualGold
                    : COLORS.mysticPurple
            } 0%, ${
              phase === "idle" 
                ? `${COLORS.mysticPurple}66` 
                : `${colors.glow}44`
            } 40%, transparent 70%)`,
          }}
          animate={{
            scale: phase === "overload" 
              ? [1, 1.3, 1] 
              : phase === "active" 
                ? [1, 1.15, 1]
                : phase === "charging"
                  ? [1, 1.1, 1]
                  : [1, 1.05, 1],
          }}
          transition={{
            duration: pulseDuration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Portal swirl */}
          <motion.svg
            viewBox={`0 0 ${maxRadius * 0.7} ${maxRadius * 0.7}`}
            className="w-full h-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.path
                key={`swirl-${i}`}
                d={`
                  M ${maxRadius * 0.35} ${maxRadius * 0.1}
                  A ${maxRadius * 0.25} ${maxRadius * 0.25} 0 0 1 ${maxRadius * 0.6} ${maxRadius * 0.35}
                  A ${maxRadius * 0.25} ${maxRadius * 0.25} 0 0 1 ${maxRadius * 0.35} ${maxRadius * 0.6}
                  A ${maxRadius * 0.25} ${maxRadius * 0.25} 0 0 1 ${maxRadius * 0.1} ${maxRadius * 0.35}
                `}
                fill="none"
                stroke={colors.border}
                strokeWidth="2"
                strokeLinecap="round"
                transform={`rotate(${i * 120} ${maxRadius * 0.35} ${maxRadius * 0.35})`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: [0, 1],
                  opacity: [0, 0.6, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "linear",
                }}
              />
            ))}
          </motion.svg>
        </motion.div>
        
        {/* Inner core */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: maxRadius * 0.12,
            height: maxRadius * 0.12,
            background: colors.center,
            boxShadow: `0 0 ${maxRadius * 0.15}px ${colors.glow}, 0 0 ${maxRadius * 0.3}px ${colors.glow}`,
          }}
          animate={{
            scale: phase === "overload"
              ? [0.8, 1.2, 0.8]
              : phase === "active"
                ? [0.9, 1.1, 0.9]
                : 1,
          }}
          transition={{
            duration: pulseDuration * 0.7,
            repeat: Infinity,
          }}
        />
        
        {/* Energy burst when active */}
        <AnimatePresence>
          {phase === "active" && (
            <motion.div
              className="absolute rounded-full"
              style={{
                width: maxRadius * 0.5,
                height: maxRadius * 0.5,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.5, 2], opacity: [0, 0.5, 0] }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            >
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: `radial-gradient(circle, ${colors.glow}44 0%, transparent 70%)`,
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== PHASE LABEL (for interactive mode) ===== */}
      {interactive && (
        <motion.div
          className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs font-mono uppercase tracking-widest"
          style={{ color: colors.border }}
          animate={{
            textShadow: isIntense
              ? `0 0 10px ${colors.glow}, 0 0 20px ${colors.glow}`
              : "none",
          }}
        >
          {phase}
        </motion.div>
      )}

      {/* Screen shake keyframes for overload */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2px, -2px); }
          20% { transform: translate(2px, 2px); }
          30% { transform: translate(-2px, 2px); }
          40% { transform: translate(2px, -2px); }
          50% { transform: translate(-1px, 1px); }
          60% { transform: translate(1px, -1px); }
          70% { transform: translate(-1px, -1px); }
          80% { transform: translate(1px, 1px); }
          90% { transform: translate(-2px, 0); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default SummoningCircle;
