"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type TransitionType = "fade" | "slide" | "ritual" | "none";

interface PageTransitionProps {
  children: React.ReactNode;
  /** Transition type */
  type?: TransitionType;
  /** Enable the transition */
  enabled?: boolean;
}

/**
 * Page transition variants
 */
const transitionVariants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  ritual: {
    initial: { opacity: 0, scale: 0.9, rotate: -5 },
    animate: { opacity: 1, scale: 1, rotate: 0 },
    exit: { opacity: 0, scale: 1.1, rotate: 5 },
  },
  none: {
    initial: {},
    animate: {},
    exit: {},
  },
};

/**
 * PageTransition wrapper component using AnimatePresence
 * Provides smooth page transitions with multiple effects
 */
export function PageTransition({ 
  children, 
  type = "fade",
  enabled = true 
}: PageTransitionProps) {
  const [key, setKey] = useState(0);

  // Reset key when children change to trigger transition
  useEffect(() => {
    if (enabled) {
      setKey(k => k + 1);
    }
  }, [children, enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  const variants = transitionVariants[type] || transitionVariants.fade;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={variants.initial}
        animate={variants.animate}
        exit={variants.exit}
        transition={{ 
          duration: type === "ritual" ? 0.5 : 0.3,
          ease: type === "none" ? undefined : "easeOut"
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * GlitchTransition - dramatic static/glitch effect
 */
export function GlitchTransition({ onComplete }: { onComplete?: () => void }) {
  const glitches = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.3,
    left: `${Math.random() * 100}%`,
    width: `${Math.random() * 30 + 10}%`,
    height: `${Math.random() * 100}%`,
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {/* Static noise layers */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0.3, 0.6, 0] }}
          transition={{ duration: 0.5, delay: i * 0.05 }}
          style={{
            position: "absolute",
            inset: 0,
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(255,255,255,${0.1 - i * 0.03}) 2px,
              rgba(255,255,255,${0.1 - i * 0.03}) 4px
            )`,
            backgroundSize: "100% 4px",
          }}
        />
      ))}

      {/* Glitch bars */}
      {glitches.map((g) => (
        <motion.div
          key={g.id}
          initial={{ 
            top: g.left, 
            left: 0, 
            width: "100%", 
            height: g.height,
            opacity: 0,
            backgroundColor: Math.random() > 0.5 ? "#00ff00" : "#ff00ff",
          }}
          animate={{ 
            opacity: [0, 0.8, 0],
            x: [0, (Math.random() - 0.5) * 50, 0],
          }}
          transition={{ 
            duration: 0.15, 
            delay: g.delay,
            repeat: Math.floor(Math.random() * 3) + 1,
          }}
          style={{
            position: "absolute",
            mixBlendMode: "difference",
          }}
        />
      ))}

      {/* Scanlines */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0.3, 0.6, 0] }}
        transition={{ duration: 0.5 }}
        style={{
          position: "absolute",
          inset: 0,
          background: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.3) 1px, rgba(0,0,0,0.3) 2px)",
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
}

/**
 * SummoningTransition - screen gets pulled into center
 */
export function SummoningTransition({ onComplete }: { onComplete?: () => void }) {
  const runes = "᛭᛫᛬ᛮᛯᛰᛜᛝᛟᛠᛡᛢᛣᛤᛥᛦᛧᛨᛩᛪ᛫᛬᛭ᛮᛯ".split("");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.01, borderRadius: "50%" }}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Outer ring */}
      <motion.div
        initial={{ scale: 0, rotate: 0 }}
        animate={{ scale: 1, rotate: 360 }}
        transition={{ duration: 2, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: "min(80vw, 80vh)",
          height: "min(80vw, 80vh)",
          border: "3px solid #8b5cf6",
          borderRadius: "50%",
          boxShadow: "0 0 30px #8b5cf6, inset 0 0 30px rgba(139, 92, 246, 0.3)",
        }}
      />

      {/* Middle ring */}
      <motion.div
        initial={{ scale: 0, rotate: 0 }}
        animate={{ scale: 1, rotate: -360 }}
        transition={{ duration: 1.5, ease: "easeInOut", delay: 0.2 }}
        style={{
          position: "absolute",
          width: "min(65vw, 65vh)",
          height: "min(65vw, 65vh)",
          border: "2px solid #a78bfa",
          borderRadius: "50%",
          borderStyle: "dashed",
        }}
      />

      {/* Inner ring */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
        style={{
          position: "absolute",
          width: "min(50vw, 50vh)",
          height: "min(50vw, 50vh)",
          border: "2px solid #c4b5fd",
          borderRadius: "50%",
        }}
      />

      {/* Pentagram */}
      <motion.svg
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, delay: 0.6 }}
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          width: "min(40vw, 40vh)",
          height: "min(40vw, 40vh)",
        }}
      >
        <polygon
          points="50,10 61,40 93,40 68,60 79,91 50,72 21,91 32,60 7,40 39,40"
          fill="none"
          stroke="#c4b5fd"
          strokeWidth="2"
        />
      </motion.svg>

      {/* Runes rotating around */}
      {runes.map((rune, i) => {
        const angle = (i * 360) / runes.length;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0], rotate: 360 }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              delay: i * 0.1,
              ease: "linear",
            }}
            style={{
              position: "absolute",
              color: "#a78bfa",
              fontSize: "1.5rem",
              transformOrigin: "center",
            }}
          >
            {rune}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/**
 * DoorTransition - doors opening/closing
 */
export function DoorTransition({ onComplete }: { onComplete?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0a",
        zIndex: 9999,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Left door */}
      <motion.div
        initial={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        style={{
          flex: 1,
          background: "linear-gradient(90deg, #1a0a2e 0%, #2d1b4e 100%)",
          borderRight: "2px solid #8b5cf6",
        }}
      />
      
      {/* Right door */}
      <motion.div
        initial={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        style={{
          flex: 1,
          background: "linear-gradient(-90deg, #1a0a2e 0%, #2d1b4e 100%)",
          borderLeft: "2px solid #8b5cf6",
        }}
      />
    </motion.div>
  );
}

export default PageTransition;
