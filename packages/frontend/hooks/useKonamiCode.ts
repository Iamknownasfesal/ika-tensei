"use client";

import { useState, useEffect, useCallback } from "react";

const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function useKonamiCode() {
  const [position, setPosition] = useState(0);
  const [hasActivated, setHasActivated] = useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (hasActivated) return;

      const key = event.key;
      const expectedKey = KONAMI_SEQUENCE[position];

      if (key === expectedKey) {
        const newPosition = position + 1;
        if (newPosition >= KONAMI_SEQUENCE.length) {
          // Full sequence matched!
          setHasActivated(true);
          setPosition(0);
        } else {
          setPosition(newPosition);
        }
      } else {
        // Wrong key - reset
        setPosition(0);
      }
    },
    [position, hasActivated]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Auto-reset after 5 seconds if it's been activated
  useEffect(() => {
    if (hasActivated) {
      const timer = setTimeout(() => {
        setHasActivated(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [hasActivated]);

  return {
    isActivated: hasActivated,
    hasActivated,
  };
}
