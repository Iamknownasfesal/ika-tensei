"use client";

import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// TYPES
// ============================================================================

interface EasterEggContextType {
  activateRainbowMode: () => void;
  deactivateRainbowMode: () => void;
  isRainbowMode: boolean;
  showSecretSprite: boolean;
}

const EasterEggContext = createContext<EasterEggContextType | null>(null);

export const useEasterEggs = () => {
  const ctx = useContext(EasterEggContext);
  if (!ctx) {
    // Return defaults if not in provider
    return {
      activateRainbowMode: () => {},
      deactivateRainbowMode: () => {},
      isRainbowMode: false,
      showSecretSprite: false,
    };
  }
  return ctx;
};

// ============================================================================
// KONAMI CODE COMPONENT
// ============================================================================

interface KonamiCodeDetectorProps {
  onSuccess: () => void;
}

function KonamiCodeDetector({ onSuccess }: KonamiCodeDetectorProps) {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const KONAMI_CODE = [
      "ArrowUp", "ArrowUp", 
      "ArrowDown", "ArrowDown", 
      "ArrowLeft", "ArrowRight", 
      "ArrowLeft", "ArrowRight", 
      "b", "a"
    ];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if key matches next in sequence
      if (e.key === KONAMI_CODE[position]) {
        const newPosition = position + 1;
        if (newPosition >= KONAMI_CODE.length) {
          // Code complete!
          onSuccess();
          setPosition(0);
        } else {
          setPosition(newPosition);
        }
      } else {
        // Reset if wrong key
        setPosition(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [position, onSuccess]);

  return null;
}

// ============================================================================
// CLICK COUNTER (Logo)
// ============================================================================

interface LogoClickCounterProps {
  targetClicks?: number;
  onReached: () => void;
  children: React.ReactNode;
}

function useClickCounter(targetClicks: number, onReached: () => void) {
  const [count, setCount] = useState(0);

  const handleClick = useCallback(() => {
    const newCount = count + 1;
    setCount(newCount);
    if (newCount >= targetClicks) {
      onReached();
      setCount(0); // Reset after reaching
    }
  }, [count, targetClicks, onReached]);

  return { count, handleClick };
}

// ============================================================================
// SECRET SPRITE OVERLAY
// ============================================================================

function SecretSpriteOverlay({ 
  onClose 
}: { 
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0, rotate: 180 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ASCII Art Ika */}
        <pre className="text-green-400 font-mono text-xs md:text-sm leading-tight">
{`
    ╱|、
   (˚ˎ 。7  
    |、˜〵  
   じしˍ,)ノ
`}
        </pre>
        <p className="mt-4 text-green-400 font-pixel text-sm">
          ✨ YOU FOUND THE SECRET! ✨
        </p>
        <p className="mt-2 text-green-600 font-mono text-xs">
          The Ika acknowledges you, traveler.
        </p>
        <p className="mt-4 text-gray-500 font-mono text-[10px]">
          (click anywhere to close)
        </p>
      </motion.div>

      {/* Confetti particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            backgroundColor: ["#ff3366", "#ffd700", "#00ccff", "#9b59b6"][i % 4],
          }}
          animate={{
            y: [0, -200],
            opacity: [1, 0],
            rotate: [0, 360],
          }}
          transition={{
            duration: 2 + Math.random(),
            delay: Math.random() * 0.5,
            repeat: Infinity,
          }}
        />
      ))}
    </motion.div>
  );
}

// ============================================================================
// RAINBOW MODE OVERLAY
// ============================================================================

function RainbowModeOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 pointer-events-none z-[9998] mix-blend-screen"
      style={{
        background: `repeating-conic-gradient(
          from 0deg,
          hsl(calc(var(--rainbow-hue, 0) * 1deg), 100%, 50%),
          hsl(calc((var(--rainbow-hue, 0) + 30) * 1deg), 100%, 50%)
        )`,
        
        opacity: 0.15,
      }}
    />
  );
}

// ============================================================================
// CONSOLE MESSAGE
// ============================================================================

function setupConsoleMessage() {
  // Only run on client
  if (typeof window === "undefined") return;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // ASCII Art for console
  const asciiArt = `
╱|、       。7  
(˚ˎ 。7    |、˜〵  
 |、˜〵   じしˍ,)ノ
 じしˍ,)ノ     

✨ Welcome, traveler of the void! ✨
The spirits whisper... you've found the secret console.
`;

  // Only show on first load
  const hasShown = sessionStorage.getItem("console-welcomed");
  if (!hasShown) {
    console.log(
      `%c${asciiArt}`,
      "color: #9b59b6; font-family: monospace; font-size: 10px; line-height: 1.2;"
    );
    console.log(
      "%c🜲 The Ika Tensei ritual awaits... 🜲",
      "color: #ffd700; font-weight: bold; font-size: 14px;"
    );
    sessionStorage.setItem("console-welcomed", "true");
  }

  // Detect devtools open
  let devtoolsOpen = false;
  const checkDevTools = () => {
    const threshold = 160;
    if (window.outerWidth - window.innerWidth > threshold || 
        window.outerHeight - window.innerHeight > threshold) {
      if (!devtoolsOpen) {
        devtoolsOpen = true;
        console.log(
          "%c👁 The void sees you... 🜲",
          "color: #ff3366; font-weight: bold;"
        );
      }
    } else {
      devtoolsOpen = false;
    }
  };

  setInterval(checkDevTools, 500);
}

// ============================================================================
// MAIN EASTER EGGS COMPONENT
// ============================================================================

interface EasterEggsProps {
  children: React.ReactNode;
}

export function EasterEggs({ children }: EasterEggsProps) {
  const [showSecretSprite, setShowSecretSprite] = useState(false);
  const [isRainbowMode, setIsRainbowMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  // Handle Konami code success
  const handleKonamiSuccess = useCallback(() => {
    setIsRainbowMode(true);
    // Auto-disable after 10 seconds
    setTimeout(() => {
      setIsRainbowMode(false);
    }, 10000);
  }, []);

  // Handle logo click
  const handleLogoClick = useCallback(() => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 10) {
      setShowSecretSprite(true);
      setClickCount(0);
    }
  }, [clickCount]);

  // Setup console message on mount
  useEffect(() => {
    setupConsoleMessage();
  }, []);

  // Expose click handler for logo
  useEffect(() => {
    const handleLogoClicks = () => {
      const logo = document.querySelector('[data-logo]');
      if (logo) {
        logo.addEventListener('click', handleLogoClick);
        return () => logo.removeEventListener('click', handleLogoClick);
      }
    };
    
    // Try immediately and also after a delay
    const cleanup1 = handleLogoClicks();
    const timeout = setTimeout(() => {
      handleLogoClicks();
    }, 1000);
    
    return () => {
      cleanup1?.();
      clearTimeout(timeout);
    };
  }, [handleLogoClick]);

  const contextValue = {
    activateRainbowMode: () => setIsRainbowMode(true),
    deactivateRainbowMode: () => setIsRainbowMode(false),
    isRainbowMode,
    showSecretSprite,
  };

  return (
    <EasterEggContext.Provider value={contextValue}>
      <KonamiCodeDetector onSuccess={handleKonamiSuccess} />
      
      {children}
      
      {/* Secret sprite overlay */}
      <AnimatePresence>
        {showSecretSprite && (
          <SecretSpriteOverlay 
            onClose={() => setShowSecretSprite(false)} 
          />
        )}
      </AnimatePresence>
      
      {/* Rainbow mode overlay */}
      <AnimatePresence>
        {isRainbowMode && <RainbowModeOverlay />}
      </AnimatePresence>
    </EasterEggContext.Provider>
  );
}

export default EasterEggs;
