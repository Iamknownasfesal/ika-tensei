"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

const DEFAULT_VOLUME = 0.15;

export function BgmPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Read persisted preference on mount
  useEffect(() => {
    const stored = localStorage.getItem("bgm-muted");
    if (stored === "true") {
      setIsMuted(true);
    }
    if (audioRef.current) {
      audioRef.current.volume = DEFAULT_VOLUME;
    }
  }, []);

  // Start playback on first user interaction (browser autoplay policy)
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
        setHasInteracted(true);
      }
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
    };

    document.addEventListener("click", handleFirstInteraction);
    document.addEventListener("touchstart", handleFirstInteraction);

    return () => {
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, []);

  // Sync muted state to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = DEFAULT_VOLUME;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem("bgm-muted", String(next));
      // If user hasn't interacted yet, start playback now
      if (!hasInteracted && audioRef.current) {
        audioRef.current.play().catch(() => {});
        setHasInteracted(true);
      }
      return next;
    });
  }, [hasInteracted]);

  return (
    <>
      <audio ref={audioRef} loop preload="auto" src="/bgm.mp3" />

      <motion.button
        onClick={toggleMute}
        className="fixed z-40 bottom-4 right-4 md:bottom-4 md:right-4
          w-11 h-11 flex items-center justify-center
          bg-ritual-dark/90 backdrop-blur-sm border-2 border-sigil-border
          rounded-sm cursor-pointer select-none
          transition-shadow duration-300"
        style={{
          boxShadow: isMuted
            ? "0 0 6px rgba(138,122,154,0.3)"
            : "0 0 12px rgba(255,51,102,0.5), 0 0 24px rgba(255,51,102,0.2)",
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label={isMuted ? "Unmute background music" : "Mute background music"}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8a7a9a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ff3366"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </motion.button>
    </>
  );
}
