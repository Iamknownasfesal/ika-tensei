"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// TYPES
// ============================================================================

export type Chain = "ethereum" | "sui" | "solana";
export type NFTStatus = "sealed" | "reborn" | "available";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface NFTCardProps {
  name: string;
  tokenId: string;
  chain: Chain;
  status: NFTStatus;
  collection?: string;
  rarity?: Rarity;
  onClick?: () => void;
  compact?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHAIN_COLORS: Record<Chain, { border: string; accent: string; hex: string }> = {
  ethereum: {
    border: "border-amber-400",
    accent: "#ffd700",
    hex: "#627eea",
  },
  sui: {
    border: "border-cyan-400",
    accent: "#00ccff",
    hex: "#4da2ff",
  },
  solana: {
    border: "border-purple-400",
    accent: "#9945ff",
    hex: "#9945ff",
  },
};

const RARITY_COLORS: Record<Rarity, { glow: string; shimmer: string; label: string }> = {
  common: {
    glow: "rgba(205, 127, 50, 0.3)",
    shimmer: "linear-gradient(135deg, transparent 40%, rgba(205,127,50,0.3) 50%, transparent 60%)",
    label: "COMMON",
  },
  rare: {
    glow: "rgba(192, 192, 192, 0.4)",
    shimmer: "linear-gradient(135deg, transparent 40%, rgba(192,192,192,0.4) 50%, transparent 60%)",
    label: "RARE",
  },
  epic: {
    glow: "rgba(255, 215, 0, 0.5)",
    shimmer: "linear-gradient(135deg, transparent 40%, rgba(255,215,0,0.5) 50%, transparent 60%)",
    label: "EPIC",
  },
  legendary: {
    glow: "rgba(255, 105, 180, 0.6)",
    shimmer: "linear-gradient(135deg, transparent 30%, rgba(255,105,180,0.4) 40%, rgba(168,85,247,0.4) 50%, rgba(34,211,238,0.4) 60%, transparent 70%)",
    label: "LEGENDARY",
  },
};

const RUNES = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛁ", "ᛃ"];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Simple hash: sum of charCodes */
function tokenHash(tokenId: string): number {
  let sum = 0;
  for (let i = 0; i < tokenId.length; i++) {
    sum += tokenId.charCodeAt(i);
  }
  return sum;
}

/** Generate 4-color palette from hash */
function generatePalette(hash: number): string[] {
  const hue = hash % 360;
  return [
    `hsl(${hue}, 70%, 50%)`,
    `hsl(${(hue + 40) % 360}, 60%, 45%)`,
    `hsl(${(hue + 80) % 360}, 55%, 55%)`,
    `hsl(${(hue + 120) % 360}, 50%, 40%)`,
  ];
}

/** Get pattern type from hash */
type PatternType = "stripes" | "checks" | "diamonds" | "circles";
function getPatternType(hash: number): PatternType {
  const patterns: PatternType[] = ["stripes", "checks", "diamonds", "circles"];
  return patterns[hash % 4];
}

// ============================================================================
// PROCEDURAL PIXEL ART COMPONENT
// ============================================================================

interface PixelArtProps {
  tokenId: string;
  size?: number;
}

const PixelArt: React.FC<PixelArtProps> = ({ tokenId, size = 160 }) => {
  const gridSize = 8;
  const pixelSize = size / gridSize;

  const art = useMemo(() => {
    const hash = tokenHash(tokenId);
    const palette = generatePalette(hash);
    const patternType = getPatternType(hash);

    const pixels: { x: number; y: number; color: string }[] = [];

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        let include = false;

        switch (patternType) {
          case "stripes":
            include = y % 2 === 0;
            break;
          case "checks":
            include = (x + y) % 2 === 0;
            break;
          case "diamonds":
            const cx = gridSize / 2;
            const cy = gridSize / 2;
            include = Math.abs(x - cx) + Math.abs(y - cy) <= 3;
            break;
          case "circles":
            const dx = x - gridSize / 2 + 0.5;
            const dy = y - gridSize / 2 + 0.5;
            include = Math.sqrt(dx * dx + dy * dy) <= 2.5;
            break;
        }

        if (include) {
          const colorHash = (hash + x * gridSize + y) % palette.length;
          pixels.push({
            x: x * pixelSize,
            y: y * pixelSize,
            color: palette[colorHash],
          });
        }
      }
    }

    return { pixels, patternType };
  }, [tokenId, pixelSize]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pixelated"
      style={{ imageRendering: "pixelated" }}
    >
      <rect width={size} height={size} fill="#0f0f1a" />
      {art.pixels.map((pixel, i) => (
        <rect
          key={i}
          x={pixel.x}
          y={pixel.y}
          width={pixelSize - 1}
          height={pixelSize - 1}
          fill={pixel.color}
        />
      ))}
      <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
    </svg>
  );
};

// ============================================================================
// CHAIN BADGE COMPONENT
// ============================================================================

interface ChainBadgeProps {
  chain: Chain;
}

const ChainBadge: React.FC<ChainBadgeProps> = ({ chain }) => {
  const config = CHAIN_COLORS[chain];

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{
        backgroundColor: `${config.hex}20`,
        color: config.hex,
        border: `1px solid ${config.hex}40`,
      }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.hex }} />
      {chain}
    </span>
  );
};

// ============================================================================
// CORNER RUNES DECORATION
// ============================================================================

interface CornerRunesProps {
  chain: Chain;
}

const CornerRunes: React.FC<CornerRunesProps> = ({ chain }) => {
  const config = CHAIN_COLORS[chain];

  const corners = [
    { top: 2, left: 2, rune: "ᚠ" },
    { top: 2, right: 2, rune: "ᚢ" },
    { bottom: 2, left: 2, rune: "ᚦ" },
    { bottom: 2, right: 2, rune: "ᚨ" },
  ];

  return (
    <>
      {corners.map((corner, i) => (
        <span
          key={i}
          className="absolute text-[8px] select-none"
          style={{
            top: corner.top,
            left: corner.left,
            right: corner.right,
            bottom: corner.bottom,
            color: config.hex,
            opacity: 0.6,
          }}
        >
          {corner.rune}
        </span>
      ))}
    </>
  );
};

// ============================================================================
// CARD BACK (SUMMONING CIRCLE PATTERN)
// ============================================================================

interface CardBackProps {
  chain: Chain;
  name: string;
  tokenId: string;
}

const CardBack: React.FC<CardBackProps> = ({ chain, name, tokenId }) => {
  const config = CHAIN_COLORS[chain];

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center p-4">
      {/* Summoning circle pattern */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full opacity-30">
        <circle cx="50" cy="50" r="45" fill="none" stroke={config.accent} strokeWidth="2" />
        <circle cx="50" cy="50" r="35" fill="none" stroke={config.accent} strokeWidth="1" strokeDasharray="4 4" />
        {/* Pentagram */}
        <polygon
          points="50,15 61,40 88,40 66,55 74,82 50,66 26,82 34,55 12,40 39,40"
          fill="none"
          stroke={config.accent}
          strokeWidth="1.5"
        />
        {/* Runes */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const x = 50 + 40 * Math.cos(angle);
          const y = 50 + 40 * Math.sin(angle);
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={config.accent} fontSize="8">
              {RUNES[i]}
            </text>
          );
        })}
      </svg>

      {/* Card info overlay */}
      <div className="relative z-10 text-center bg-black/60 p-3 rounded">
        <div className="text-xs text-white font-bold mb-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>{name}</div>
        <div className="text-[8px] text-gray-400">ID: {tokenId.slice(0, 8)}...</div>
        <div 
          className="text-[10px] mt-2 px-2 py-1 rounded"
          style={{ 
            backgroundColor: `${config.hex}20`,
            color: config.hex,
            border: `1px solid ${config.hex}40`,
          }}
        >
          {chain.toUpperCase()}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STATUS OVERLAYS
// ============================================================================

interface StatusOverlayProps {
  status: NFTStatus;
  chain: Chain;
}

const StatusOverlay: React.FC<StatusOverlayProps> = ({ status, chain }) => {
  const config = CHAIN_COLORS[chain];

  if (status === "available") return null;

  if (status === "sealed") {
    return (
      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
        <div className="text-3xl mb-2 opacity-60">{config.hex === "#627eea" ? "⬡" : config.hex === "#4da2ff" ? "◇" : "◎"}</div>
        <div className="text-[10px] font-bold text-red-400 tracking-widest" style={{ fontFamily: "monospace" }}>
          SEALED
        </div>
      </div>
    );
  }

  if (status === "reborn") {
    return (
      <>
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            boxShadow: "inset 0 0 20px rgba(34, 197, 94, 0.5), 0 0 15px rgba(34, 197, 94, 0.3)",
          }}
        />
        <span className="absolute top-2 left-2 text-[8px] text-green-400 animate-pulse">✦</span>
        <span className="absolute top-2 right-2 text-[8px] text-green-400 animate-pulse" style={{ animationDelay: "0.3s" }}>✦</span>
        <span className="absolute bottom-2 left-2 text-[8px] text-green-400 animate-pulse" style={{ animationDelay: "0.6s" }}>✦</span>
        <span className="absolute bottom-2 right-2 text-[8px] text-green-400 animate-pulse" style={{ animationDelay: "0.9s" }}>✦</span>
      </>
    );
  }

  return null;
};

// ============================================================================
// MAIN NFT CARD COMPONENT
// ============================================================================

export const NFTCard: React.FC<NFTCardProps> = ({
  name,
  tokenId,
  chain,
  status,
  collection,
  rarity = "common",
  onClick,
  compact = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const config = CHAIN_COLORS[chain];
  const rarityConfig = RARITY_COLORS[rarity];

  // Compact variant
  if (compact) {
    return (
      <motion.div
        className={`
          relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
          bg-gradient-to-r from-gray-900 to-gray-800
          border ${config.border}
          ${status === "reborn" ? "shadow-[0_0_10px_rgba(34,197,94,0.4)]" : ""}
        `}
        onClick={onClick}
        whileHover={{ scale: 1.02, x: 4 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <span className="text-xs" style={{ color: config.hex }}>
          {config.hex === "#627eea" ? "⬡" : config.hex === "#4da2ff" ? "◇" : "◎"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate">{name}</div>
          {collection && <div className="text-[10px] text-gray-400 truncate">{collection}</div>}
        </div>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: status === "sealed" ? "rgba(239,68,68,0.2)" : status === "reborn" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.1)",
            color: status === "sealed" ? "#ef4444" : status === "reborn" ? "#22c55e" : "#9ca3af",
          }}
        >
          {status.toUpperCase()}
        </span>
      </motion.div>
    );
  }

  // Full-size card with flip
  return (
    <motion.div
      className="relative cursor-pointer w-full max-w-[200px] mx-auto"
      onClick={() => {
        onClick?.();
        setIsFlipped(!isFlipped);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <motion.div
        className="relative w-full h-[280px]"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 200, damping: 25 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* FRONT FACE */}
        <div
          className={`
            absolute inset-0 rounded-lg overflow-hidden
            bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900
            border-2 ${config.border}
            ${status === "reborn" ? "shadow-[0_0_25px_rgba(34,197,94,0.5),0_0_50px_rgba(34,197,94,0.2)]" : ""}
            transition-all duration-300
          `}
          style={{ 
            backfaceVisibility: "hidden",
            boxShadow: status === "reborn" ? undefined : `0 0 10px ${config.hex}30`,
          }}
        >
          {/* Rarity glow */}
          {rarity !== "common" && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: `inset 0 0 20px ${rarityConfig.glow}`,
              }}
            />
          )}

          {/* Holographic shimmer on hover */}
          <motion.div
            className="absolute inset-0 pointer-events-none opacity-0"
            style={{
              background: rarityConfig.shimmer,
              backgroundSize: "200% 200%",
              mixBlendMode: "overlay",
            }}
            animate={{
              opacity: isHovered ? 1 : 0,
              backgroundPosition: isHovered ? ["0% 0%", "200% 200%"] : "0% 0%",
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />

          {/* Inner sigil border */}
          <div className="absolute inset-1 rounded border border-white/10" />

          {/* Corner runes */}
          <CornerRunes chain={chain} />

          {/* Card content */}
          <div className="relative z-10">
            {/* Image area */}
            <div className="h-[160px] flex items-center justify-center bg-black/30">
              <PixelArt tokenId={tokenId} size={140} />
            </div>

            {/* Bottom section */}
            <div className="p-3 space-y-2 bg-gradient-to-t from-gray-900/80 to-transparent">
              {/* Rarity badge */}
              {rarity !== "common" && (
                <div 
                  className={`text-[8px] font-bold text-center px-1 py-0.5 rounded ${
                    rarity === "legendary" ? "animate-pulse" : ""
                  }`}
                  style={{ 
                    backgroundColor: rarityConfig.glow,
                    color: rarity === "rare" ? "#C0C0C0" : 
                           rarity === "epic" ? "#FFD700" : 
                           rarity === "legendary" ? "#FF69B4" : "#CD7F32",
                  }}
                >
                  {rarityConfig.label}
                </div>
              )}

              {/* Name */}
              <div
                className="text-sm font-bold text-white truncate text-center"
                style={{ fontFamily: "monospace", textShadow: "1px 1px 2px rgba(0,0,0,0.8)" }}
              >
                {name}
              </div>

              {/* Chain badge */}
              <div className="flex justify-center">
                <ChainBadge chain={chain} />
              </div>

              {/* Collection */}
              {collection && (
                <div className="text-[10px] text-gray-400 text-center truncate">{collection}</div>
              )}
            </div>
          </div>

          {/* Status overlay */}
          <StatusOverlay status={status} chain={chain} />
        </div>

        {/* BACK FACE */}
        <div
          className={`
            absolute inset-0 rounded-lg overflow-hidden
            border-2 ${config.border}
            bg-gradient-to-br from-gray-900 to-black
          `}
          style={{ 
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            boxShadow: `0 0 15px ${config.hex}40`,
          }}
        >
          <CardBack chain={chain} name={name} tokenId={tokenId} />
        </div>
      </motion.div>
    </motion.div>
  );
};

// ============================================================================
// SKELETON LOADER
// ============================================================================

interface NFTCardSkeletonProps {
  compact?: boolean;
}

export const NFTCardSkeleton: React.FC<NFTCardSkeletonProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <div
        className="relative flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700"
      >
        <div className="w-4 h-4 rounded-full bg-gray-700 animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-3 bg-gray-700 rounded w-24 animate-pulse" />
          <div className="h-2 bg-gray-800 rounded w-16 animate-pulse" />
        </div>
        <div className="h-4 bg-gray-700 rounded w-12 animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      className="relative rounded-lg overflow-hidden bg-gray-800 border-2 border-gray-700"
      style={{ width: 200 }}
      animate={{
        boxShadow: [
          "0 0 10px rgba(139, 92, 246, 0.2)",
          "0 0 20px rgba(139, 92, 246, 0.4)",
          "0 0 10px rgba(139, 92, 246, 0.2)",
        ],
      }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-2 opacity-20">
          {RUNES.slice(0, 9).map((rune, i) => (
            <motion.span
              key={i}
              className="text-xl text-purple-400"
              animate={{ opacity: [0.2, 0.8, 0.2] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            >
              {rune}
            </motion.span>
          ))}
        </div>
      </div>

      <div className="h-[160px] bg-gray-700/30 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-700 rounded mx-auto w-3/4 animate-pulse" />
        <div className="h-3 bg-gray-800 rounded mx-auto w-1/2 animate-pulse" />
      </div>
    </motion.div>
  );
};

export default NFTCard;
