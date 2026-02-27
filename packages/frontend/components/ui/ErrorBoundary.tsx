"use client";

import React, { Component, ErrorInfo, ReactNode, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { PixelButton } from "@/components/ui/PixelButton";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Occult error messages
const ERROR_MESSAGES = [
  "The ritual has failed...",
  "The seals have broken...",
  "The spirits are unsettled...",
  "The void consumes all...",
  "The binding has snapped...",
  "Dark energy interferes...",
];

// Get random error message based on time
const getRandomErrorMessage = () => {
  const index = Math.floor(Date.now() / 10000) % ERROR_MESSAGES.length;
  return ERROR_MESSAGES[index];
};

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay 
          error={this.state.error} 
          onRetry={this.handleRetry} 
        />
      );
    }

    return this.props.children;
  }
}

// Separate error display component for animation
function ErrorDisplay({ 
  error, 
  onRetry 
}: { 
  error: Error | null; 
  onRetry: () => void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  const errorMessage = error?.message || getRandomErrorMessage();
  const truncatedMessage = errorMessage.length > 200 
    ? errorMessage.substring(0, 200) + "..." 
    : errorMessage;

  const handleRetry = () => {
    setIsRetrying(true);
    // Generate particles for energy charge animation
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 0.5,
    }));
    setParticles(newParticles);
    
    setTimeout(() => {
      setIsRetrying(false);
      setParticles([]);
      onRetry();
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-void-purple">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blood-pink rounded-full"
            initial={{ 
              x: `${Math.random() * 100}%`, 
              y: "110%",
              opacity: 0,
            }}
            animate={{ 
              y: ["110%", `${Math.random() * 50 - 25}%`, "-10%"],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              delay: Math.random() * 2,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex flex-col items-center gap-8 text-center px-4 max-w-lg"
      >
        {/* IkaSprite with worried expression */}
        <motion.div
          animate={{
            y: [0, -5, 0],
            rotate: [0, -2, 2, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Image src="/art/ika-mascot-v2.png" alt="Ika" width={96} height={96} className="pixelated" />
        </motion.div>

        {/* Glitch effect title */}
        <motion.h1 
          className="font-pixel text-2xl text-blood-pink"
          animate={{
            textShadow: [
              "0 0 10px rgba(255,51,102,0.5)",
              "0 0 20px rgba(255,51,102,0.8)",
              "0 0 10px rgba(255,51,102,0.5)",
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          RITUAL FAILED
        </motion.h1>

        {/* Occult-themed error title */}
        <h2 className="font-pixel text-lg text-ritual-gold">
          {getRandomErrorMessage()}
        </h2>

        {/* Error message */}
        <div className="bg-black/40 border border-sigil-border rounded p-4 max-w-md">
          <p className="font-mono text-xs text-faded-spirit break-words">
            {truncatedMessage}
          </p>
        </div>

        {/* Energy charge animation when retrying */}
        <AnimatePresence>
          {isRetrying && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
            >
              {particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  className="absolute w-2 h-2 bg-soul-cyan rounded-full"
                  style={{
                    left: `${particle.x}%`,
                    top: `${particle.y}%`,
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: [0, 1.5, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 1,
                    delay: particle.delay,
                    repeat: Infinity,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-4">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <PixelButton
              variant="primary"
              size="md"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    ⟳
                  </motion.span>
                  Channeling...
                </span>
              ) : (
                "↻ Retry Ritual"
              )}
            </PixelButton>
          </motion.div>
          
          <Link href="/">
            <PixelButton variant="dark" size="md">
              ⬆ Return to Safety
            </PixelButton>
          </Link>
        </div>

        {/* Error code for debugging */}
        <p className="font-mono text-[10px] text-gray-600">
          Error Code: {error?.name || "UNKNOWN"} • {new Date().toISOString()}
        </p>
      </motion.div>
    </div>
  );
}

/**
 * Simple error display for inline use
 */
export function InlineError({ 
  message, 
  onRetry 
}: { 
  message?: string; 
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-red-950/30 border border-red-800 rounded">
      <Image src="/art/ika-mascot-v2.png" alt="Ika" width={32} height={32} className="pixelated" />
      <div className="flex-1">
        <p className="text-red-400 text-sm font-medium">Ritual Failed</p>
        <p className="text-faded-spirit text-xs">{message || "An error occurred"}</p>
      </div>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="text-red-400 hover:text-red-300 text-sm"
        >
          ↻
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;
