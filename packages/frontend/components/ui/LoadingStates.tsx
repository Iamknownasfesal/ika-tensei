"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SummoningCircle, CirclePhase } from './SummoningCircle';

// ============================================================================
// TYPES
// ============================================================================

interface FullPageLoaderProps {
  message?: string;
  phase?: CirclePhase;
}

interface SkeletonCardProps {
  className?: string;
}

interface SkeletonTextProps {
  width?: string;
  className?: string;
}

interface ButtonSpinnerProps {
  className?: string;
  phase?: CirclePhase;
}

interface InlineLoaderProps {
  className?: string;
  variant?: "dots" | "runes" | "orbs";
}

interface LoadingMessageProps {
  message?: string;
  variant?: "gathering" | "summoning" | "channeling" | "binding";
}

// ============================================================================
// ANIMATION KEYFRAMES (inline styles)
// ============================================================================

const spinnerKeyframes = `
  @keyframes spin-rune {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes typewriter-cursor {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes orb-bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  @keyframes summon-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.02); }
  }
`;

// ============================================================================
// FULL PAGE LOADER (Summoning Circle)
// ============================================================================

export const FullPageLoader: React.FC<FullPageLoaderProps> = ({
  message = "Channeling mana...",
  phase = "charging",
}) => {
  const [displayedText, setDisplayedText] = useState('');

  // Typewriter effect
  useEffect(() => {
    if (displayedText.length < message.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(message.slice(0, displayedText.length + 1));
      }, 35 + Math.random() * 50);
      return () => clearTimeout(timeout);
    }
  }, [displayedText, message]);

  return (
    <>
      <style>{spinnerKeyframes}</style>
      <div className="fixed inset-0 bg-void-purple flex flex-col items-center justify-center z-50">
        {/* Star field background */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-ghost-white rounded-full"
              style={{
                width: Math.random() * 2 + 1,
                height: Math.random() * 2 + 1,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.4 + 0.15,
                animation: `summon-pulse ${3 + Math.random() * 3}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>

        {/* Summoning Circle */}
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          <SummoningCircle phase={phase} size={280} intensity={0.8} />
        </div>

        {/* Typewriter text */}
        <div className="mt-8 text-center">
          <p className="text-purple-300 text-lg md:text-xl font-pixel">
            {displayedText}
            <span
              className="inline-block w-0.5 h-5 bg-purple-400 ml-1"
              style={{ animation: 'typewriter-cursor 0.7s steps(1) infinite' }}
            />
          </p>
        </div>
      </div>
    </>
  );
};

// ============================================================================
// SKELETON CARD (Pulsing Pixel Card Placeholder)
// ============================================================================

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className = '' }) => {
  return (
    <>
      <style>{spinnerKeyframes}</style>
      <div
        className={`relative overflow-hidden bg-rune-purple rounded-lg border border-sigil-border ${className}`}
        style={{ minHeight: '120px' }}
      >
        {/* Shimmer overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-ghost-white/20 to-transparent"
          style={{
            animation: 'shimmer 2s infinite',
            backgroundSize: '200% 100%',
          }}
        />
        {/* Rune pattern background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
      </div>
    </>
  );
};

// ============================================================================
// SKELETON TEXT (Pulsing Text Line Placeholder)
// ============================================================================

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  width = '100%',
  className = ''
}) => {
  return (
    <>
      <style>{spinnerKeyframes}</style>
      <div
        className={`h-4 rounded bg-rune-purple overflow-hidden relative ${className}`}
        style={{ width, minWidth: '60px' }}
      >
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-ghost-white/15 to-transparent"
          style={{
            animation: 'shimmer 1.8s infinite',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </>
  );
};

// ============================================================================
// BUTTON SPINNER (Summoning Circle Mini)
// ============================================================================

export const ButtonSpinner: React.FC<ButtonSpinnerProps> = ({ 
  className = '',
  phase = "charging" 
}) => {
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <SummoningCircle phase={phase} size={32} intensity={0.7} />
    </div>
  );
};

// ============================================================================
// INLINE LOADER (Bouncing Pixel Dots / Runes / Orbs)
// ============================================================================

export const InlineLoader: React.FC<InlineLoaderProps> = ({ 
  className = '',
  variant = "dots" 
}) => {
  const runes = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ'];
  const orbs = ['●', '○', '◐', '◑'];

  if (variant === "runes") {
    return (
      <>
        <style>{spinnerKeyframes}</style>
        <div className={`flex gap-1 ${className}`}>
          {runes.map((rune, i) => (
            <motion.span
              key={i}
              className="text-purple-400"
              animate={{ opacity: [0.3, 1, 0.3], rotate: [0, 180, 360] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "linear",
              }}
            >
              {rune}
            </motion.span>
          ))}
        </div>
      </>
    );
  }

  if (variant === "orbs") {
    return (
      <>
        <style>{spinnerKeyframes}</style>
        <div className={`flex gap-1 ${className}`}>
          {orbs.map((orb, i) => (
            <motion.span
              key={i}
              className="text-soul-cyan"
              animate={{ 
                scale: [0.8, 1.2, 0.8],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            >
              {orb}
            </motion.span>
          ))}
        </div>
      </>
    );
  }

  // Default dots
  return (
    <>
      <style>{spinnerKeyframes}</style>
      <div className={`flex gap-1 ${className}`}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-purple-400 rounded-sm"
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </>
  );
};

// ============================================================================
// LOADING MESSAGES (Typewriter style)
// ============================================================================

const LOADING_MESSAGES = {
  gathering: [
    "Gathering souls...",
    "Collecting ethereal energy...",
    "Summoning spirits from the void...",
    "Weaving the spiritual threads...",
    "Calling forth from beyond...",
  ],
  summoning: [
    "Preparing the ritual...",
    "Drawing the pentagram...",
    "Channeling ancient power...",
    "The spirits are listening...",
    "Ritual in progress...",
  ],
  channeling: [
    "Channeling mana...",
    "Aligning the cosmic energies...",
    "Flowing with the arcane...",
    "Mana circulation complete...",
    "Power accumulating...",
  ],
  binding: [
    "Binding the contract...",
    "Sealing the pact...",
    "Forging the connection...",
    "The binding strengthens...",
    "Contract validated...",
  ],
};

export const LoadingMessage: React.FC<LoadingMessageProps> = ({
  message,
  variant = "gathering",
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const messages = LOADING_MESSAGES[variant];
  const currentMessage = message || messages[Math.floor(Math.random() * messages.length)];

  useEffect(() => {
    if (displayedText.length < currentMessage.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(currentMessage.slice(0, displayedText.length + 1));
      }, 30 + Math.random() * 40);
      return () => clearTimeout(timeout);
    }
  }, [displayedText, currentMessage]);

  return (
    <>
      <style>{spinnerKeyframes}</style>
      <div className="flex items-center gap-3">
        <InlineLoader variant="runes" />
        <p className="text-purple-300 text-sm font-mono">
          {displayedText}
          <span
            className="inline-block w-0.5 h-4 bg-purple-400 ml-0.5"
            style={{ animation: 'typewriter-cursor 0.7s steps(1) infinite' }}
          />
        </p>
      </div>
    </>
  );
};

// ============================================================================
// PAGE-LEVEL LOADER (Full page overlay)
// ============================================================================

interface PageLoaderProps {
  variant?: "gathering" | "summoning" | "channeling" | "binding";
  customMessage?: string;
}

export const PageLoader: React.FC<PageLoaderProps> = ({
  variant = "gathering",
  customMessage,
}) => {
  const messages = LOADING_MESSAGES[variant];
  const message = customMessage || messages[Math.floor(Math.random() * messages.length)];

  return (
    <FullPageLoader message={message} phase="active" />
  );
};

// ============================================================================
// COMPONENT-LEVEL LOADER
// ============================================================================

interface ComponentLoaderProps {
  message?: string;
}

export const ComponentLoader: React.FC<ComponentLoaderProps> = ({
  message = "Loading...",
}) => {
  return (
    <div className="flex items-center justify-center p-4">
      <LoadingMessage variant="gathering" />
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  FullPageLoader,
  SkeletonCard,
  SkeletonText,
  ButtonSpinner,
  InlineLoader,
  LoadingMessage,
  PageLoader,
  ComponentLoader,
};
