"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

// ============================================
// Utility functions
// ============================================
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// ============================================
// IkaSprite - renders the actual pixel art mascot
// ============================================
export type IkaExpression = "neutral" | "excited" | "worried" | "smug" | "angry" | "sleeping" | "happy" | "thinking" | "powered-up";

interface IkaSpriteProps {
  size?: number;
  expression?: IkaExpression;
  /** Enable animation (bobbing, glowing, etc.) */
  animate?: boolean;
  /** Custom color override */
  color?: string;
}

const IKA_COLORS = {
  body: "#9b59b6",
  bodyLight: "#c084fc",
  bodyDark: "#6b21a8",
  eye: "#e8e0f0",
  pupil: "#0d0a1a",
  tentacle: "#ff3366",
  tentacleDark: "#cc1144",
  blush: "#ff6b9d",
  sleep: "#6b5a7a",
  glow: "#00ccff",
};

export function IkaSprite({ size = 32, expression = "neutral", animate = true, color }: IkaSpriteProps) {
  const [animFrame, setAnimFrame] = useState(0);
  const baseColor = color || IKA_COLORS.body;
  
  useEffect(() => {
    if (!animate) return;
    const interval = setInterval(() => {
      setAnimFrame(f => (f + 1) % 4);
    }, 300);
    return () => clearInterval(interval);
  }, [animate]);

  const tentacleWave = animate ? Math.sin(animFrame * 0.5) : 0;

  const getExpressionColor = (expr: IkaExpression) => {
    switch (expr) {
      case "excited":
      case "powered-up":
        return IKA_COLORS.glow;
      case "angry":
        return "#ff0000";
      default:
        return "transparent";
    }
  };

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ imageRendering: "pixelated" as const }}>
      {/* Head dome */}
      <rect x="10" y="2" width="12" height="2" fill={IKA_COLORS.bodyLight} />
      <rect x="8" y="4" width="16" height="2" fill={IKA_COLORS.bodyLight} />
      <rect x="6" y="6" width="20" height="2" fill={baseColor} />
      <rect x="5" y="8" width="22" height="12" fill={baseColor} />
      
      {/* Eyes */}
      {expression === "sleeping" ? (
        <>
          <rect x="8" y="12" width="5" height="1" fill={IKA_COLORS.sleep} />
          <rect x="19" y="12" width="5" height="1" fill={IKA_COLORS.sleep} />
        </>
      ) : expression === "angry" ? (
        <>
          <rect x="8" y="11" width="5" height="3" fill={IKA_COLORS.eye} />
          <rect x="19" y="11" width="5" height="3" fill={IKA_COLORS.eye} />
          <rect x="8" y="10" width="5" height="1" fill={IKA_COLORS.tentacle} />
          <rect x="19" y="10" width="5" height="1" fill={IKA_COLORS.tentacle} />
          <rect x="9" y="13" width="1" height="1" fill={IKA_COLORS.pupil} />
          <rect x="22" y="13" width="1" height="1" fill={IKA_COLORS.pupil} />
        </>
      ) : expression === "worried" ? (
        <>
          <rect x="8" y="12" width="5" height="4" fill={IKA_COLORS.eye} />
          <rect x="19" y="12" width="5" height="4" fill={IKA_COLORS.eye} />
          <rect x="9" y="14" width="2" height="2" fill={IKA_COLORS.pupil} />
          <rect x="21" y="14" width="2" height="2" fill={IKA_COLORS.pupil} />
          <rect x="11" y="17" width="4" height="1" fill={IKA_COLORS.bodyDark} />
          <rect x="17" y="17" width="4" height="1" fill={IKA_COLORS.bodyDark} />
        </>
      ) : expression === "smug" ? (
        <>
          <rect x="8" y="11" width="5" height="4" fill={IKA_COLORS.eye} />
          <rect x="19" y="11" width="5" height="4" fill={IKA_COLORS.eye} />
          <rect x="9" y="13" width="2" height="2" fill={IKA_COLORS.pupil} />
          <rect x="21" y="13" width="2" height="2" fill={IKA_COLORS.pupil} />
          <rect x="13" y="16" width="6" height="1" fill={IKA_COLORS.bodyDark} />
        </>
      ) : (
        // neutral, excited, happy, thinking, powered-up
        <>
          <rect x="8" y="11" width="5" height="4" fill={IKA_COLORS.eye} />
          <rect x="19" y="11" width="5" height="4" fill={IKA_COLORS.eye} />
          <rect x="9" y="13" width="2" height="2" fill={IKA_COLORS.pupil} />
          <rect x="21" y="13" width="2" height="2" fill={IKA_COLORS.pupil} />
        </>
      )}
      
      {/* Blush marks */}
      {(expression === "excited" || expression === "happy" || expression === "powered-up") && (
        <>
          <rect x="5" y="16" width="3" height="2" fill={IKA_COLORS.blush} opacity="0.5" />
          <rect x="24" y="16" width="3" height="2" fill={IKA_COLORS.blush} opacity="0.5" />
        </>
      )}
      
      {/* Body mantle */}
      <rect x="5" y="20" width="22" height="2" fill={baseColor} />
      <rect x="6" y="22" width="20" height="4" fill={IKA_COLORS.bodyDark} />
      
      {/* Tentacles with animation */}
      <rect x="6" y="26" width="2" height="4" fill={IKA_COLORS.tentacle} />
      <rect x="4" y="28 + tentacleWave" width="2" height="2" fill={IKA_COLORS.tentacleDark} />
      <rect x="10" y="26" width="2" height="5" fill={IKA_COLORS.tentacle} />
      <rect x="14" y="26" width="2" height="4" fill={IKA_COLORS.tentacle} />
      <rect x="18" y="26" width="2" height="5" fill={IKA_COLORS.tentacle} />
      <rect x="22" y="26" width="2" height="4" fill={IKA_COLORS.tentacle} />
      <rect x="24" y="28 - tentacleWave" width="2" height="2" fill={IKA_COLORS.tentacleDark} />
      
      {/* Expression glow effects */}
      {(expression === "excited" || expression === "powered-up") && (
        <>
          <rect x="14" y="4" width="4" height="2" fill={IKA_COLORS.glow} opacity="0.6" />
          <rect x="4" y="10" width="2" height="2" fill={IKA_COLORS.glow} opacity="0.4" />
          <rect x="26" y="10" width="2" height="2" fill={IKA_COLORS.glow} opacity="0.4" />
        </>
      )}
      
      {/* Zzz for sleeping */}
      {expression === "sleeping" && (
        <>
          <rect x="24" y="6" width="3" height="1" fill="#ffffff" opacity="0.7" />
          <rect x="26" y="4" width="3" height="1" fill="#ffffff" opacity="0.5" />
        </>
      )}
    </svg>
  );
}

// ============================================
// SealIcon - 16x16 wax seal
// ============================================
interface SealIconProps {
  size?: number;
}

const SEAL_COLORS = {
  gold: "#ffd700",
  purple: "#9b59b6",
  pink: "#ff3366",
  grey: "#8a7a9a",
};

export function SealIcon({ size = 32 }: SealIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      {/* Gold top */}
      <rect x="4" y="1" width="8" height="2" fill={SEAL_COLORS.gold} />
      <rect x="5" y="2" width="6" height="1" fill={SEAL_COLORS.gold} />
      
      {/* Purple body */}
      <rect x="3" y="3" width="10" height="8" fill={SEAL_COLORS.purple} />
      <rect x="4" y="4" width="8" height="6" fill={darkenColor(SEAL_COLORS.purple, 15)} />
      
      {/* Pink center mark */}
      <rect x="5" y="5" width="6" height="4" fill={SEAL_COLORS.pink} />
      <rect x="6" y="6" width="4" height="2" fill="#ff6699" />
      <rect x="7" y="7" width="2" height="1" fill="#ffffff" opacity="0.3" />
      
      {/* Gold bottom */}
      <rect x="4" y="11" width="8" height="2" fill={SEAL_COLORS.gold} />
      <rect x="5" y="12" width="6" height="1" fill={SEAL_COLORS.gold} />
      
      {/* Chain links below */}
      <rect x="3" y="13" width="2" height="2" fill={SEAL_COLORS.grey} />
      <rect x="7" y="13" width="2" height="2" fill={SEAL_COLORS.grey} />
      <rect x="11" y="13" width="2" height="2" fill={SEAL_COLORS.grey} />
      <rect x="5" y="14" width="2" height="1" fill={SEAL_COLORS.grey} />
      <rect x="9" y="14" width="2" height="1" fill={SEAL_COLORS.grey} />
    </svg>
  );
}

// ============================================
// ChainBadge - 8x8 rounded square
// ============================================
type ChainType = "ethereum" | "sui" | "solana";

interface ChainBadgeProps {
  chain: ChainType;
  size?: number;
}

const CHAIN_COLORS: Record<ChainType, { bg: string; letter: string }> = {
  ethereum: { bg: "#627eea", letter: "E" },
  sui: { bg: "#4da2ff", letter: "S" },
  solana: { bg: "#9945ff", letter: "S" },
};

export function ChainBadge({ chain, size = 24 }: ChainBadgeProps) {
  const { bg } = CHAIN_COLORS[chain];
  
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ imageRendering: "pixelated" as const }}>
      {/* Rounded square background */}
      <rect x="1" y="1" width="6" height="6" rx="1" fill={bg} />
      <rect x="1" y="1" width="6" height="6" rx="1" fill={darkenColor(bg, 10)} opacity="0.3" />
      
      {/* Center letter pixel */}
      <rect x="3" y="3" width="2" height="2" fill="#ffffff" />
    </svg>
  );
}

// ============================================
// TreasureChest - 16x16
// ============================================
interface TreasureChestProps {
  size?: number;
  open?: boolean;
}

const CHEST_COLORS = {
  wood: "#8b4513",
  woodDark: "#5c2e0a",
  gold: "#ffd700",
  goldLight: "#ffec8b",
  metal: "#c0c0c0",
};

export function TreasureChest({ size = 32, open = false }: TreasureChestProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      {open ? (
        <>
          {/* Lid open upward */}
          <rect x="2" y="1" width="12" height="4" fill={CHEST_COLORS.wood} />
          <rect x="3" y="1" width="10" height="3" fill={CHEST_COLORS.woodDark} />
          
          {/* Gold glow inside */}
          <rect x="3" y="9" width="10" height="5" fill={CHEST_COLORS.gold} opacity="0.5" />
          
          {/* Gold coins */}
          <rect x="4" y="10" width="2" height="2" fill={CHEST_COLORS.gold} />
          <rect x="7" y="9" width="2" height="2" fill={CHEST_COLORS.goldLight} />
          <rect x="10" y="10" width="2" height="2" fill={CHEST_COLORS.gold} />
          <rect x="5" y="12" width="2" height="2" fill={CHEST_COLORS.goldLight} />
          <rect x="9" y="11" width="2" height="2" fill={CHEST_COLORS.gold} />
          
          {/* Chest base */}
          <rect x="2" y="9" width="12" height="5" fill={CHEST_COLORS.wood} />
          <rect x="3" y="10" width="10" height="3" fill={CHEST_COLORS.woodDark} />
          
          {/* Metal bands */}
          <rect x="3" y="9" width="1" height="5" fill={CHEST_COLORS.metal} />
          <rect x="12" y="9" width="1" height="5" fill={CHEST_COLORS.metal} />
        </>
      ) : (
        <>
          {/* Closed chest */}
          <rect x="2" y="5" width="12" height="9" fill={CHEST_COLORS.wood} />
          <rect x="3" y="6" width="10" height="7" fill={CHEST_COLORS.woodDark} />
          
          {/* Lid */}
          <rect x="2" y="3" width="12" height="4" fill={CHEST_COLORS.wood} />
          <rect x="3" y="4" width="10" height="2" fill={CHEST_COLORS.woodDark} />
          
          {/* Lock */}
          <rect x="6" y="7" width="4" height="3" fill={CHEST_COLORS.metal} />
          <rect x="7" y="8" width="2" height="1" fill={CHEST_COLORS.gold} />
          
          {/* Metal bands */}
          <rect x="3" y="5" width="1" height="9" fill={CHEST_COLORS.metal} />
          <rect x="12" y="5" width="1" height="9" fill={CHEST_COLORS.metal} />
        </>
      )}
    </svg>
  );
}

// ============================================
// ScrollIcon - 16x16
// ============================================
interface ScrollIconProps {
  size?: number;
  open?: boolean;
}

const SCROLL_COLORS = {
  parchment: "#f4e4bc",
  parchmentDark: "#d4c49c",
  wood: "#8b4513",
};

export function ScrollIcon({ size = 32, open = false }: ScrollIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      {open ? (
        <>
          {/* Unrolled scroll */}
          <rect x="1" y="1" width="14" height="2" fill={SCROLL_COLORS.wood} />
          <rect x="2" y="1" width="12" height="1" fill={darkenColor(SCROLL_COLORS.wood, 10)} />
          
          <rect x="1" y="3" width="14" height="10" fill={SCROLL_COLORS.parchment} />
          <rect x="2" y="4" width="12" height="8" fill={SCROLL_COLORS.parchmentDark} opacity="0.3" />
          
          <rect x="3" y="5" width="10" height="1" fill="#2a1a0a" opacity="0.4" />
          <rect x="3" y="7" width="8" height="1" fill="#2a1a0a" opacity="0.3" />
          <rect x="3" y="9" width="9" height="1" fill="#2a1a0a" opacity="0.3" />
          <rect x="3" y="11" width="6" height="1" fill="#2a1a0a" opacity="0.2" />
          
          <rect x="1" y="13" width="14" height="2" fill={SCROLL_COLORS.wood} />
          <rect x="2" y="14" width="12" height="1" fill={darkenColor(SCROLL_COLORS.wood, 10)} />
        </>
      ) : (
        <>
          <rect x="5" y="2" width="6" height="12" fill={SCROLL_COLORS.wood} />
          <rect x="6" y="3" width="4" height="10" fill={SCROLL_COLORS.parchment} />
          
          <rect x="4" y="1" width="3" height="2" fill={SCROLL_COLORS.wood} />
          <rect x="5" y="1" width="1" height="1" fill={SCROLL_COLORS.parchmentDark} />
          
          <rect x="4" y="13" width="3" height="2" fill={SCROLL_COLORS.wood} />
          <rect x="5" y="14" width="1" height="1" fill={SCROLL_COLORS.parchmentDark} />
          
          <rect x="7" y="7" width="2" height="2" fill="#ff3366" />
        </>
      )}
    </svg>
  );
}

// ============================================
// SwordIcon - 16x16
// ============================================
interface SwordIconProps {
  size?: number;
  drawn?: boolean;
}

const SWORD_COLORS = {
  blade: "#c0c0c0",
  bladeLight: "#e0e0e0",
  handle: "#8b4513",
  guard: "#ffd700",
};

export function SwordIcon({ size = 32, drawn = false }: SwordIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      {drawn ? (
        <>
          <rect x="7" y="1" width="2" height="10" fill={SWORD_COLORS.blade} />
          <rect x="7" y="1" width="1" height="10" fill={SWORD_COLORS.bladeLight} />
          
          <rect x="4" y="11" width="8" height="1" fill={SWORD_COLORS.guard} />
          <rect x="5" y="11" width="6" height="1" fill={darkenColor(SWORD_COLORS.guard, 10)} />
          
          <rect x="7" y="12" width="2" height="3" fill={SWORD_COLORS.handle} />
          
          <rect x="7" y="15" width="2" height="1" fill={SWORD_COLORS.guard} />
        </>
      ) : (
        <>
          <rect x="6" y="6" width="4" height="9" fill={SWORD_COLORS.handle} />
          <rect x="6" y="6" width="3" height="9" fill={darkenColor(SWORD_COLORS.handle, 15)} />
          
          <rect x="6" y="3" width="4" height="3" fill={SWORD_COLORS.handle} />
          <rect x="7" y="2" width="2" height="1" fill={SWORD_COLORS.guard} />
          
          <rect x="5" y="10" width="6" height="1" fill={SWORD_COLORS.handle} />
        </>
      )}
    </svg>
  );
}

// ============================================
// ShieldIcon - 16x16 purple shield with gold crest
// ============================================
interface ShieldIconProps {
  size?: number;
}

const SHIELD_COLORS = {
  purple: "#9b59b6",
  gold: "#ffd700",
  outline: "#2a1a3a",
};

export function ShieldIcon({ size = 32 }: ShieldIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      <rect x="2" y="2" width="12" height="12" fill={SHIELD_COLORS.purple} />
      <rect x="3" y="3" width="10" height="10" fill={darkenColor(SHIELD_COLORS.purple, 15)} />
      <rect x="3" y="3" width="10" height="10" fill={SHIELD_COLORS.purple} />
      
      <rect x="5" y="5" width="6" height="4" fill={SHIELD_COLORS.gold} />
      <rect x="6" y="6" width="4" height="1" fill={SHIELD_COLORS.purple} />
      <rect x="6" y="8" width="4" height="1" fill={SHIELD_COLORS.purple} />
      <rect x="7" y="9" width="2" height="1" fill={SHIELD_COLORS.gold} />
      
      <rect x="6" y="3" width="4" height="2" fill={SHIELD_COLORS.gold} />
      
      <rect x="2" y="2" width="12" height="1" fill={SHIELD_COLORS.outline} />
      <rect x="2" y="13" width="12" height="1" fill={SHIELD_COLORS.outline} />
      <rect x="2" y="3" width="1" height="10" fill={SHIELD_COLORS.outline} />
      <rect x="13" y="3" width="1" height="10" fill={SHIELD_COLORS.outline} />
    </svg>
  );
}

// ============================================
// PotionIcon - 16x16 different colors
// ============================================
type PotionVariant = "health" | "mana" | "stamina" | "poison" | "elixir" | "empty";

interface PotionIconProps {
  size?: number;
  variant?: PotionVariant;
}

const POTION_COLORS: Record<PotionVariant, { bottle: string; liquid: string; glow: string }> = {
  health: { bottle: "#e8e0f0", liquid: "#ff3366", glow: "#ff6699" },
  mana: { bottle: "#e8e0f0", liquid: "#3366ff", glow: "#6699ff" },
  stamina: { bottle: "#e8e0f0", liquid: "#33ff66", glow: "#66ff99" },
  poison: { bottle: "#c8d0c8", liquid: "#33cc33", glow: "#66ff66" },
  elixir: { bottle: "#ffe8f0", liquid: "#ff66ff", glow: "#ff99ff" },
  empty: { bottle: "#d8d8d8", liquid: "#a0a0a0", glow: "#c0c0c0" },
};

export function PotionIcon({ size = 24, variant = "health" }: PotionIconProps) {
  const { bottle, liquid, glow } = POTION_COLORS[variant];
  const liquidLevel = variant === "empty" ? 2 : 10;

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      <rect x="5" y="2" width="6" height="2" fill={bottle} />
      <rect x="4" y="4" width="8" height="10" fill={bottle} />
      <rect x="5" y="5" width="6" height="8" fill={darkenColor(bottle, 10)} />
      
      <rect x="5" y={16 - liquidLevel} width="6" height={liquidLevel} fill={liquid} />
      <rect x="6" y={16 - liquidLevel + 1} width="1" height="1" fill={glow} opacity="0.5" />
      
      <rect x="6" y="0" width="4" height="2" fill="#8b4513" />
      <rect x="5" y="5" width="1" height="6" fill="#ffffff" opacity="0.3" />
    </svg>
  );
}

// ============================================
// RuneStone - 16x16 with 6 variants
// ============================================
interface RuneStoneProps {
  size?: number;
  variant?: number;
}

const RUNE_COLORS = [
  { stone: "#4a3020", rune: "#ff6600", glow: "#ffaa00" },
  { stone: "#203040", rune: "#00aaff", glow: "#66ddff" },
  { stone: "#304020", rune: "#44aa44", glow: "#88cc66" },
  { stone: "#606070", rune: "#aaddff", glow: "#ddffff" },
  { stone: "#f0e0a0", rune: "#ffffaa", glow: "#ffffff" },
  { stone: "#201030", rune: "#8844cc", glow: "#aa66ff" },
];

const RUNE_PATTERNS = [
  ["01110", "10001", "11111", "10001", "10001"],
  ["00100", "01110", "10101", "00100", "00100"],
  ["01110", "10001", "10001", "11111", "10001"],
  ["00100", "01010", "11111", "01010", "10101"],
  ["01110", "11111", "11111", "01110", "01110"],
  ["10001", "11011", "11111", "01110", "00100"],
];

export function RuneStone({ size = 32, variant = 0 }: RuneStoneProps) {
  const colors = RUNE_COLORS[variant % 6];
  const pattern = RUNE_PATTERNS[variant % 6];
  
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      <rect x="2" y="2" width="12" height="12" fill={colors.stone} />
      <rect x="3" y="3" width="10" height="10" fill={darkenColor(colors.stone, 10)} />
      <rect x="3" y="3" width="10" height="10" fill={colors.glow} opacity="0.2" />
      <rect x="4" y="4" width="8" height="8" fill={colors.glow} opacity="0.15" />
      
      {pattern.map((row, y) =>
        row.split("").map((pixel, x) =>
          pixel === "1" && (
            <rect
              key={`${x}-${y}`}
              x={5 + x * 1}
              y={5 + y * 1}
              width="1"
              height="1"
              fill={colors.rune}
            />
          )
        )
      )}
      
      <rect x="2" y="2" width="12" height="1" fill={colors.glow} opacity="0.4" />
      <rect x="2" y="13" width="12" height="1" fill={colors.glow} opacity="0.4" />
      <rect x="2" y="3" width="1" height="10" fill={colors.glow} opacity="0.4" />
      <rect x="13" y="3" width="1" height="10" fill={colors.glow} opacity="0.4" />
    </svg>
  );
}

// ============================================
// SoulOrb - 8x8 glowing circle with animation
// ============================================
interface SoulOrbProps {
  size?: number;
  color?: string;
  animate?: boolean;
}

const SOUL_COLORS = {
  cyan: "#00ccff",
};

export function SoulOrb({ size = 24, color = SOUL_COLORS.cyan, animate = true }: SoulOrbProps) {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    if (!animate) return;
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 10);
    }, 100);
    return () => clearInterval(interval);
  }, [animate]);

  const floatOffset = animate ? Math.sin(phase * 0.5) * 1 : 0;
  const pulseSize = animate ? 1 + Math.floor(phase / 3) : 1;

  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ imageRendering: "pixelated" as const }}>
      <rect x="1" y="1" width="6" height="6" fill={color} opacity="0.2" />
      <rect x="2" y="2" width="4" height="4" fill={color} opacity="0.3" />
      
      <g transform={`translate(0, ${floatOffset})`}>
        <rect x="2" y="2" width="4" height="4" fill={color} />
        <rect x="3" y="3" width="2" height="2" fill={lightenColor(color, 20)} />
        <rect x="3" y="3" width="1" height="1" fill="#ffffff" opacity="0.6" />
      </g>
      
      {animate && (
        <rect 
          x={3 - pulseSize} 
          y={3 - pulseSize} 
          width={4 + pulseSize * 2} 
          height={4 + pulseSize * 2} 
          fill={color} 
          opacity={0.2}
        />
      )}
    </svg>
  );
}

// ============================================
// PortalIcon - 16x16 swirling void
// ============================================
interface PortalIconProps {
  size?: number;
  animate?: boolean;
}

const PORTAL_COLORS = {
  purple: "#6633cc",
  pink: "#ff3366",
  dark: "#1a0a2e",
};

export function PortalIcon({ size = 32, animate = true }: PortalIconProps) {
  const [portalPhase, setPortalPhase] = useState(0);
  
  useEffect(() => {
    if (!animate) return;
    const interval = setInterval(() => {
      setPortalPhase(p => (p + 1) % 16);
    }, 80);
    return () => clearInterval(interval);
  }, [animate]);

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" as const }}>
      <rect x="2" y="2" width="12" height="12" fill={PORTAL_COLORS.dark} />
      <rect x="3" y="3" width="10" height="10" fill={PORTAL_COLORS.purple} opacity="0.3" />
      
      <rect x="4" y="4" width="8" height="8" fill={PORTAL_COLORS.purple} opacity="0.4" />
      <rect x="5" y="5" width="6" height="6" fill={PORTAL_COLORS.pink} opacity="0.3" />
      <rect x="6" y="6" width="4" height="4" fill={PORTAL_COLORS.purple} opacity="0.5" />
      
      <rect x="7" y="7" width="2" height="2" fill="#000000" />
      <rect x="7" y="7" width="1" height="1" fill={PORTAL_COLORS.pink} opacity="0.5" />
      
      {animate && (
        <>
          <rect x="4" y="5" width="1" height="1" fill="#ffffff" opacity={(portalPhase % 5) / 5} />
          <rect x="11" y="7" width="1" height="1" fill="#ffffff" opacity={((portalPhase + 3) % 5) / 5} />
          <rect x="5" y="11" width="1" height="1" fill="#ffffff" opacity={((portalPhase + 6) % 5) / 5} />
        </>
      )}
    </svg>
  );
}

// ============================================
// CrownIcon - 8x8 gold pixel crown
// ============================================
interface CrownIconProps {
  size?: number;
}

const CROWN_COLORS = {
  gold: "#ffd700",
  goldDark: "#b8860b",
};

export function CrownIcon({ size = 24 }: CrownIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ imageRendering: "pixelated" as const }}>
      <rect x="1" y="4" width="6" height="3" fill={CROWN_COLORS.gold} />
      <rect x="2" y="5" width="4" height="2" fill={CROWN_COLORS.goldDark} />
      
      <rect x="1" y="2" width="1" height="3" fill={CROWN_COLORS.gold} />
      <rect x="3" y="1" width="2" height="4" fill={CROWN_COLORS.gold} />
      <rect x="6" y="2" width="1" height="3" fill={CROWN_COLORS.gold} />
      
      <rect x="1" y="1" width="1" height="1" fill={CROWN_COLORS.gold} />
      <rect x="3" y="0" width="2" height="1" fill={CROWN_COLORS.gold} />
      <rect x="6" y="1" width="1" height="1" fill={CROWN_COLORS.gold} />
      
      <rect x="3" y="5" width="2" height="1" fill="#ff3366" />
    </svg>
  );
}

// ============================================
// StarRank - 1-5 stars, each 6x6 pixels
// ============================================
interface StarRankProps {
  size?: number;
  count?: number;
  animate?: boolean;
}

const STAR_COLORS = {
  gold: "#ffd700",
  goldDark: "#b8860b",
  empty: "#4a4a4a",
};

const STAR_PATTERN = [
  "01010",
  "11111",
  "11111",
  "01010",
  "10101",
];

export function StarRank({ size = 32, count = 3, animate = true }: StarRankProps) {
  const [starPhase, setStarPhase] = useState(0);
  
  useEffect(() => {
    if (!animate) return;
    const interval = setInterval(() => {
      setStarPhase(p => (p + 1) % 8);
    }, 200);
    return () => clearInterval(interval);
  }, [animate]);

  const starGlow = [0.3, 0.5, 0.7, 0.5, 0.3, 0.5, 0.7, 0.5];
  const starWidth = Math.floor(size / 5);
  
  return (
    <svg width={size} height={starWidth} viewBox="0 0 25 5" style={{ imageRendering: "pixelated" as const }}>
      {Array(count).fill(0).map((_, starIndex) => {
        const glowIntensity = animate ? starGlow[(starPhase + starIndex) % 8] : 0.5;
        const xOffset = starIndex * 5;
        return (
          <g key={`star-${starIndex}`} transform={`translate(${xOffset}, 0)`}>
            <rect x="-0.5" y="-0.5" width="6" height="6" fill={STAR_COLORS.gold} opacity={glowIntensity * 0.3} />
            {STAR_PATTERN.map((row, y) =>
              row.split("").map((pixel, x) =>
                pixel === "1" && (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width="1"
                    height="1"
                    fill={STAR_COLORS.gold}
                  />
                )
              )
            )}
            <rect x="2" y="2" width="1" height="1" fill="#ffffff" opacity="0.5" />
          </g>
        );
      })}
      
      {Array(5 - count).fill(0).map((_, i) => {
        const xOffset = (count + i) * 5;
        return (
          <g key={`empty-${i}`} transform={`translate(${xOffset}, 0)`}>
            {STAR_PATTERN.map((row, y) =>
              row.split("").map((pixel, x) =>
                pixel === "1" && (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width="1"
                    height="1"
                    fill={STAR_COLORS.empty}
                    opacity="0.3"
                  />
                )
              )
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ============================================
// GuildBanner - Animated flutter
// ============================================
interface GuildBannerProps {
  size?: number;
  color?: string;
  crestColor?: string;
  animate?: boolean;
}

export function GuildBanner({ size = 48, color = "#9b59b6", crestColor = "#ffd700", animate = true }: GuildBannerProps) {
  const [flutterPhase, setFlutterPhase] = useState(0);
  
  useEffect(() => {
    if (!animate) return;
    const interval = setInterval(() => {
      setFlutterPhase(p => (p + 1) % 6);
    }, 150);
    return () => clearInterval(interval);
  }, [animate]);

  const wave = [0, 1, 2, 1, 0, -1];
  const currentWave = wave[flutterPhase];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ imageRendering: "pixelated" as const }}>
      <rect x="2" y="2" width="2" height="20" fill="#8b4513" />
      <rect x="2" y="2" width="1" height="20" fill={darkenColor("#8b4513", 10)} />
      
      <rect x="4" y="4" width="16" height="14" fill={color} />
      <rect x="5" y="5" width="14" height="12" fill={darkenColor(color, 15)} />
      
      {[0, 1, 2, 3].map(i => (
        <rect 
          key={i} 
          x={4 + i * 4} 
          y={4 + (i % 2 === 0 ? currentWave : -currentWave)} 
          width="4" 
          height="1" 
          fill={color} 
        />
      ))}
      
      <rect x="8" y="7" width="8" height="6" fill={crestColor} />
      <rect x="10" y="8" width="4" height="1" fill={color} />
      <rect x="10" y="10" width="4" height="1" fill={color} />
      <rect x="11" y="12" width="2" height="1" fill={crestColor} />
      
      {[0, 1, 2, 3, 4].map(i => (
        <rect 
          key={`fringe-${i}`} 
          x={5 + i * 3} 
          y={18 + (i % 2 === 0 ? 0 : 1)} 
          width="2" 
          height="3" 
          fill={crestColor} 
        />
      ))}
    </svg>
  );
}

// ============================================
// Export all sprites
// ============================================
export default {
  IkaSprite,
  SealIcon,
  ChainBadge,
  TreasureChest,
  ScrollIcon,
  SwordIcon,
  ShieldIcon,
  PotionIcon,
  RuneStone,
  SoulOrb,
  PortalIcon,
  CrownIcon,
  StarRank,
  GuildBanner,
};
