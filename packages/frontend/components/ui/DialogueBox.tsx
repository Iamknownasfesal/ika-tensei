"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { PixelButton } from "./PixelButton";

export type PortraitExpression = "neutral" | "excited" | "worried" | "smug" | "angry" | "sleeping" | "happy" | "sad" | "surprised" | "thinking";
export type DialogueVariant = "normal" | "dramatic" | "system" | "warning";

export interface DialogueChoice {
  id?: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
}

// Portrait expression mapping (kept for type compatibility)
function _unusedMapping(portrait?: PortraitExpression): string | undefined {
  return portrait;
}

/** Sound effect callbacks - implement with actual audio in parent */
export interface DialogueSoundEffects {
  /** Called when a character is typed */
  onType?: () => void;
  /** Called when text completes typing */
  onComplete?: () => void;
  /** Called when a choice is selected */
  onChoiceSelect?: (choiceIndex: number) => void;
}

interface DialogueBoxProps {
  text: string;
  speaker?: string;
  portrait?: PortraitExpression;
  variant?: DialogueVariant;
  /** Typewriter speed in ms per character (lower = faster) */
  speed?: number;
  /** Enable/disable typewriter effect */
  typewriter?: boolean;
  onComplete?: () => void;
  choices?: DialogueChoice[];
  /** Sound effect callbacks */
  soundEffects?: DialogueSoundEffects;
  /** Show the continue indicator */
  showContinue?: boolean;
  /** Auto-advance after completion (in ms) */
  autoAdvanceDelay?: number;
  onAutoAdvance?: () => void;
}

export function DialogueBox({
  text,
  speaker = "Ika",
  portrait = "neutral",
  variant = "normal",
  speed = 30,
  typewriter = true,
  onComplete,
  choices,
  soundEffects,
  showContinue = true,
  autoAdvanceDelay,
  onAutoAdvance,
}: DialogueBoxProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [showChoices, setShowChoices] = useState(false);
  const typingRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when text changes
  useEffect(() => {
    setDisplayedText("");
    setIsTyping(typewriter);
    setShowChoices(false);

    if (!typewriter) {
      setDisplayedText(text);
      setIsTyping(false);
      setShowChoices(true);
      onComplete?.();
      return;
    }

    let charIndex = 0;

    const typeNextChar = () => {
      if (charIndex < text.length) {
        setDisplayedText(text.slice(0, charIndex + 1));
        soundEffects?.onType?.();
        charIndex++;
        typingRef.current = setTimeout(typeNextChar, speed);
      } else {
        setIsTyping(false);
        setShowChoices(true);
        soundEffects?.onComplete?.();
        
        // Auto-advance setup
        if (autoAdvanceDelay && onAutoAdvance) {
          autoAdvanceRef.current = setTimeout(() => {
            onAutoAdvance();
          }, autoAdvanceDelay);
        }
        
        onComplete?.();
      }
    };

    // Start typing after brief delay
    typingRef.current = setTimeout(typeNextChar, 100);

    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, [text, speed, typewriter, onComplete, soundEffects, autoAdvanceDelay, onAutoAdvance]);

  // Handle click to skip typing
  const handleClick = useCallback(() => {
    if (isTyping && typewriter) {
      // Skip to end of text
      if (typingRef.current) clearTimeout(typingRef.current);
      setDisplayedText(text);
      setIsTyping(false);
      setShowChoices(true);
      soundEffects?.onComplete?.();
      onComplete?.();
    }
  }, [isTyping, typewriter, text, onComplete, soundEffects]);

  // Handle choice selection
  const handleChoiceSelect = useCallback((choice: DialogueChoice, index: number) => {
    if (choice.disabled) return;
    soundEffects?.onChoiceSelect?.(index);
    choice.onClick();
  }, [soundEffects]);

  // Get variant-specific classes
  const getVariantClasses = () => {
    switch (variant) {
      case "dramatic":
        return "bg-black/95 border-blood-pink shadow-[0_0_40px_rgba(220,38,38,0.4),inset_0_0_60px_rgba(0,0,0,0.8)]";
      case "system":
        return "bg-black border-spectral-green font-mono text-spectral-green";
      case "warning":
        return "bg-red-950/80 border-demon-red animate-pulse";
      default:
        return "bg-card-purple/95 border-sigil-border";
    }
  };

  // Check if system variant (no portrait)
  const isSystem = variant === "system";

  return (
    <div 
      className={`
        relative max-w-3xl mx-auto p-4 
        border-2 ${getVariantClasses()}
        transition-all duration-200
        ${variant === "dramatic" ? "dramatic-overlay" : ""}
        ${isTyping && typewriter ? "cursor-pointer" : ""}
      `}
      onClick={handleClick}
    >
      {/* Speaker name tag */}
      {!isSystem && speaker && (
        <div className="absolute -top-3 left-4 bg-ritual-dark px-3 py-1 border-2 border-sigil-border">
          <span className="font-pixel text-[10px] text-ritual-gold tracking-wider uppercase">
            {speaker}
          </span>
        </div>
      )}

      {/* System variant: simple text without portrait */}
      {isSystem ? (
        <div className="mt-2">
          <p className="font-mono text-sm leading-relaxed text-spectral-green">
            {displayedText}
            {!isTyping && <span className="typewriter-cursor" />}
          </p>
          
          {/* Choices for system variant */}
          {showChoices && choices && choices.length > 0 && (
            <div className="mt-4 space-y-2">
              {choices.map((choice, index) => (
                <PixelButton
                  key={index}
                  variant="dark"
                  size="sm"
                  onClick={() => handleChoiceSelect(choice, index)}
                  disabled={choice.disabled}
                  className="w-full text-left justify-start"
                >
                  <span className="text-spectral-green">▸ {choice.text}</span>
                </PixelButton>
              ))}
            </div>
          )}

          {/* Continue indicator */}
          {!isTyping && !choices && showContinue && (
            <div className="mt-3 text-right">
              <span className="font-pixel text-[8px] text-faded-spirit animate-pulse">
                ▼ PRESS
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Normal/Dramatic/Warning: portrait + text */
        <div className="flex gap-5 items-start pt-3">
          {/* Pixel art portrait with ornate frame */}
          <div className="flex-shrink-0 bg-card-purple border-2 border-sigil-border p-2 relative">
            <Image src="/art/ika-mascot-v2.png" alt="Ika" width={56} height={56} className="pixelated" />
            {/* Gold corner marks */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-ritual-gold" />
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-ritual-gold" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-ritual-gold" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-ritual-gold" />
          </div>

          {/* Text area */}
          <div className="flex-1 min-h-[60px]">
            <p className={`
              font-silk text-sm leading-relaxed
              ${variant === "warning" ? "text-demon-red" : "text-ghost-white"}
              ${variant === "dramatic" ? "font-medium" : ""}
            `}>
              {displayedText}
              {/* Blinking cursor while typing */}
              {isTyping && typewriter && <span className="typewriter-cursor">▊</span>}
            </p>

            {/* Choices appear when text is complete */}
            {showChoices && choices && choices.length > 0 && (
              <div className="mt-4 space-y-2">
                {choices.map((choice, index) => (
                  <PixelButton
                    key={index}
                    variant={variant === "warning" ? "warning" : "primary"}
                    size="sm"
                    onClick={() => handleChoiceSelect(choice, index)}
                    disabled={choice.disabled}
                    className="w-full text-left justify-start"
                  >
                    <span className={variant === "warning" ? "text-demon-red" : ""}>
                      ▸ {choice.text}
                    </span>
                  </PixelButton>
                ))}
              </div>
            )}

            {/* Blinking down arrow when complete (no choices) */}
            {!isTyping && (!choices || choices.length === 0) && showContinue && (
              <div className="mt-3 text-right">
                <span className="font-pixel text-[8px] text-faded-spirit animate-pulse">
                  ▼ PRESS
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline dialogue for notifications/status updates
 */
export function InlineDialogue({
  text,
  variant = "system",
}: {
  text: string;
  variant?: "system" | "warning" | "success";
}) {
  const variantStyles = {
    system: "border-spectral-green text-spectral-green",
    warning: "border-demon-red text-demon-red",
    success: "border-green-500 text-green-400",
  };

  return (
    <div className={`
      inline-flex items-center gap-2 px-3 py-1.5 
      border ${variantStyles[variant]}
      bg-black/60 text-xs font-mono
    `}>
      <span className="animate-pulse">●</span>
      {text}
    </div>
  );
}

export default DialogueBox;
