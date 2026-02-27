import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
  random,
  Easing,
} from "remotion";

// ============================================================================
// PALETTE
// ============================================================================
const C = {
  void: "#0d0a1a",
  deep: "#060410",
  pink: "#ff3366",
  gold: "#ffd700",
  cyan: "#00ccff",
  green: "#00ff88",
  white: "#f0e8ff",
  spirit: "#8b7aac",
  purple: "#9b59b6",
  crimson: "#dc143c",
  cardBg: "#1a1428",
  border: "#3d2f5c",
};

const FONT = "'Press Start 2P', 'Courier New', monospace";
const FONT_JP = "'Noto Sans JP', sans-serif";
const FONT_SILK = "'Silkscreen', 'Press Start 2P', monospace";

// ============================================================================
// POST-PROCESSING
// ============================================================================
const PixelGrid: React.FC<{ opacity?: number }> = ({ opacity = 0.04 }) => (
  <div style={{
    position: "absolute", inset: 0, zIndex: 200, pointerEvents: "none",
    backgroundImage: `linear-gradient(rgba(0,0,0,${opacity}) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,${opacity}) 1px, transparent 1px)`,
    backgroundSize: "3px 3px",
  }} />
);

const CRT: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const flicker = 0.92 + Math.sin(frame * 0.4) * 0.08;
  return <>
    <div style={{
      position: "absolute", inset: 0, zIndex: 190, pointerEvents: "none",
      background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,${0.1 * intensity * flicker}) 2px, rgba(0,0,0,${0.1 * intensity * flicker}) 4px)`,
    }} />
    <div style={{
      position: "absolute", inset: 0, zIndex: 191, pointerEvents: "none",
      background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${0.7 * intensity}) 100%)`,
    }} />
    <div style={{
      position: "absolute", inset: 0, zIndex: 189, pointerEvents: "none",
      boxShadow: `inset 3px 0 40px ${C.pink}08, inset -3px 0 40px ${C.cyan}08`,
    }} />
  </>;
};

const GlitchBar: React.FC<{ active: boolean }> = ({ active }) => {
  const frame = useCurrentFrame();
  if (!active || frame % 7 > 2) return null;
  const y = random(`gb-${frame}`) * 100;
  const h = 2 + random(`gbh-${frame}`) * 6;
  return <div style={{
    position: "absolute", left: 0, right: 0, top: `${y}%`, height: h,
    backgroundColor: `${C.pink}33`, zIndex: 185, pointerEvents: "none",
    transform: `translateX(${(random(`gbx-${frame}`) - 0.5) * 20}px)`,
  }} />;
};

// ============================================================================
// ORBS + STARS
// ============================================================================
const Orbs: React.FC<{ count: number; color: string; speed?: number; size?: number }> = ({ count, color, speed = 1, size = 4 }) => {
  const frame = useCurrentFrame();
  const orbs = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: random(`ox-${i}`) * 100, y: random(`oy-${i}`) * 100,
    s: size * (0.5 + random(`os-${i}`)), phase: random(`op-${i}`) * Math.PI * 2,
    spd: (0.5 + random(`osp-${i}`) * 1.5) * speed,
  })), [count, size, speed]);
  return <>{orbs.map((o, i) => {
    const x = o.x + Math.sin(frame * 0.015 * o.spd + o.phase) * 8;
    const y = (o.y - frame * 0.3 * o.spd + 120) % 120 - 10;
    return <div key={i} style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      width: o.s, height: o.s, borderRadius: "50%",
      backgroundColor: color, opacity: 0.25 + Math.sin(frame * 0.04 + o.phase) * 0.25,
      boxShadow: `0 0 ${o.s * 3}px ${color}, 0 0 ${o.s * 6}px ${color}66`,
    }} />;
  })}</>;
};

const StarField: React.FC<{ density?: number }> = ({ density = 80 }) => {
  const frame = useCurrentFrame();
  const stars = useMemo(() => Array.from({ length: density }, (_, i) => ({
    x: random(`sx-${i}`) * 100, y: random(`sy-${i}`) * 100,
    s: 1 + random(`ss-${i}`) * 2, phase: random(`sp-${i}`) * Math.PI * 2,
    tw: 0.02 + random(`st-${i}`) * 0.04,
  })), [density]);
  return <>{stars.map((s, i) => (
    <div key={i} style={{
      position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
      width: s.s, height: s.s, borderRadius: "50%",
      backgroundColor: C.white,
      opacity: 0.15 + Math.sin(frame * s.tw + s.phase) * 0.15,
    }} />
  ))}</>;
};

// ============================================================================
// NES BOX
// ============================================================================
const NESBox: React.FC<{
  children: React.ReactNode; width: number | string; height?: number | string;
  borderColor?: string; bgColor?: string; style?: React.CSSProperties;
  glow?: string;
}> = ({ children, width, height, borderColor = C.border, bgColor = `${C.cardBg}f0`, style, glow }) => (
  <div style={{
    width, height, position: "relative", backgroundColor: bgColor,
    border: `4px solid ${borderColor}`,
    boxShadow: `inset -4px -4px 0 0 ${borderColor}88, inset 4px 4px 0 0 ${borderColor}44, 6px 6px 0 0 rgba(0,0,0,0.4)${glow ? `, 0 0 30px ${glow}, 0 0 60px ${glow}44` : ""}`,
    ...style,
  }}>{children}</div>
);

// ============================================================================
// JRPG DIALOGUE BOX
// ============================================================================
const JRPGDialogue: React.FC<{
  text: string; speaker?: string; progress: number;
  variant?: "normal" | "dramatic";
}> = ({ text, speaker = "Ika", progress, variant = "normal" }) => {
  const frame = useCurrentFrame();
  const charsToShow = Math.floor(progress * text.length);
  const displayText = text.slice(0, charsToShow);
  const cursorBlink = Math.sin(frame * 0.15) > 0;
  const isDramatic = variant === "dramatic";

  return (
    <NESBox width={900} borderColor={isDramatic ? C.pink : C.border}
      bgColor={isDramatic ? "rgba(13,10,26,0.95)" : `${C.cardBg}f0`}
      glow={isDramatic ? `${C.pink}44` : undefined}>
      <div style={{
        position: "absolute", top: -16, left: 20,
        backgroundColor: C.void, padding: "4px 16px",
        border: `3px solid ${isDramatic ? C.pink : C.border}`,
        boxShadow: `inset -2px -2px 0 0 ${isDramatic ? C.pink : C.border}66`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 12, color: C.gold, letterSpacing: 3 }}>
          {speaker.toUpperCase()}
        </span>
      </div>
      <div style={{ display: "flex", gap: 20, padding: "28px 24px 20px", alignItems: "flex-start" }}>
        <div style={{
          flexShrink: 0, position: "relative", padding: 6,
          border: `3px solid ${C.border}`, backgroundColor: C.cardBg,
        }}>
          <Img src={staticFile("art/ika-mascot-v2.png")} width={72} height={72}
            style={{ imageRendering: "pixelated" }} />
          {[[-3, -3, "Top", "Left"], [-3, undefined, "Top", "Right"],
            [undefined, -3, "Bottom", "Left"], [undefined, undefined, "Bottom", "Right"]].map(([t, l, bt, bl], i) => (
            <div key={i} style={{
              position: "absolute", width: 10, height: 10,
              ...(t !== undefined ? { top: t as number } : { bottom: -3 }),
              ...(l !== undefined ? { left: l as number } : { right: -3 }),
              [`border${bt}`]: `2px solid ${C.gold}`,
              [`border${bl}`]: `2px solid ${C.gold}`,
            }} />
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 70 }}>
          <span style={{
            fontFamily: FONT_SILK, fontSize: 24, color: isDramatic ? C.pink : C.white,
            lineHeight: 2, letterSpacing: 0.5,
            textShadow: isDramatic ? `0 0 10px ${C.pink}44` : undefined,
          }}>
            {displayText}
          </span>
          {cursorBlink && charsToShow < text.length && (
            <span style={{ fontFamily: FONT, fontSize: 24, color: C.pink }}>▊</span>
          )}
          {charsToShow >= text.length && cursorBlink && (
            <span style={{ fontFamily: FONT, fontSize: 10, color: C.spirit, marginLeft: 10 }}>▼</span>
          )}
        </div>
      </div>
    </NESBox>
  );
};

// ============================================================================
// PIXEL TEXT
// ============================================================================
const PxText: React.FC<{
  text: string; size: number; color: string;
  glow?: boolean; shake?: boolean; jp?: boolean;
  opacity?: number; spacing?: number;
}> = ({ text, size, color, glow = true, shake = false, jp = false, opacity = 1, spacing }) => {
  const frame = useCurrentFrame();
  const sx = shake ? (random(`stx-${frame}`) - 0.5) * 8 : 0;
  const sy = shake ? (random(`sty-${frame}`) - 0.5) * 8 : 0;
  return <div style={{
    fontFamily: jp ? FONT_JP : FONT, fontSize: size,
    fontWeight: jp ? 900 : undefined, color, opacity,
    textShadow: glow ? `0 0 ${size * 0.5}px ${color}, 0 0 ${size}px ${color}44, 0 4px 12px rgba(0,0,0,0.9)` : `0 4px 12px rgba(0,0,0,0.9)`,
    textAlign: "center", lineHeight: 1.3,
    letterSpacing: spacing ?? (jp ? 10 : 2),
    transform: `translate(${sx}px, ${sy}px)`,
  }}>{text}</div>;
};

// ============================================================================
// RITUAL CIRCLE
// ============================================================================
const RitualCircle: React.FC<{
  size: number; progress: number; glowColor?: string;
}> = ({ size, progress, glowColor = C.gold }) => {
  const frame = useCurrentFrame();
  const p = Math.sin(frame * 0.06) * 0.15;
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛏᛒᛖᛗᛚᛝᛞᛟ";
  return <div style={{ width: size, height: size, position: "relative" }}>
    <svg viewBox="0 0 200 200" width={size} height={size}
      style={{ filter: `drop-shadow(0 0 ${15 + p * 25}px ${glowColor}66)` }}>
      <circle cx="100" cy="100" r="96" fill="none" stroke={glowColor}
        strokeWidth="1.5" opacity={0.6 + p}
        strokeDasharray={`${progress * 603} 603`}
        transform={`rotate(${frame * 0.3}, 100, 100)`} />
      <circle cx="100" cy="100" r="72" fill="none" stroke={C.pink}
        strokeWidth="1" opacity={0.4 + p} strokeDasharray={`${progress * 452} 452`}
        transform={`rotate(${-frame * 0.2}, 100, 100)`} />
      <circle cx="100" cy="100" r="50" fill="none" stroke={glowColor}
        strokeWidth="0.6" opacity={0.3 + p}
        strokeDasharray={`${progress * 314} 314`}
        transform={`rotate(${frame * 0.4}, 100, 100)`} />
      <polygon points="100,15 165,143 35,143" fill="none" stroke={glowColor}
        strokeWidth="1.2" opacity={(0.5 + p) * Math.min(1, progress * 2)}
        transform={`rotate(${frame * 0.15}, 100, 100)`} />
      <polygon points="100,185 35,57 165,57" fill="none" stroke={glowColor}
        strokeWidth="1.2" opacity={(0.5 + p) * Math.min(1, progress * 2)}
        transform={`rotate(${-frame * 0.15}, 100, 100)`} />
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2 + frame * 0.008;
        return <text key={i}
          x={100 + 85 * Math.cos(a)} y={100 + 85 * Math.sin(a)}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="7" fill={glowColor} opacity={progress * 16 > i ? 0.5 + p : 0}
          style={{ fontFamily: "serif" }}
        >{runes[i % runes.length]}</text>;
      })}
      <circle cx="100" cy="100" r={6 + p * 10} fill={C.pink} opacity={0.5 + p * 0.5} />
      <circle cx="100" cy="100" r={3 + p * 5} fill={C.gold} opacity={0.8} />
    </svg>
  </div>;
};

// ============================================================================
// NFT CARD
// ============================================================================
const NFTCard: React.FC<{
  image: string; label: string; chainLabel: string; chainColor: string;
  size?: number; rarity?: string; rarityColor?: string;
  reborn?: boolean; dead?: boolean;
}> = ({ image, label, chainLabel, chainColor, size = 220, rarity, rarityColor, reborn = false, dead = false }) => {
  const frame = useCurrentFrame();
  const rebornGlow = reborn ? 15 + Math.sin(frame * 0.08) * 10 : 0;
  return (
    <NESBox width={size} borderColor={dead ? `${C.spirit}44` : reborn ? C.gold : `${chainColor}88`}
      glow={reborn ? `${C.gold}55` : undefined}
      style={{ overflow: "hidden", filter: dead ? "saturate(0.2) brightness(0.6)" : undefined }}>
      <Img src={staticFile("art/card-frame.png")} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        opacity: 0.2, imageRendering: "pixelated", zIndex: 5, pointerEvents: "none",
      }} />
      <div style={{
        width: size - 8, height: size - 60,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: C.deep, overflow: "hidden",
      }}>
        <Img src={staticFile(image)} style={{
          width: "100%", height: "100%", objectFit: "cover",
          filter: reborn ? `drop-shadow(0 0 ${rebornGlow}px ${C.gold})` : dead ? "grayscale(0.8)" : undefined,
        }} />
      </div>
      {rarity && <div style={{
        textAlign: "center", padding: "3px 0",
        backgroundColor: `${rarityColor}33`, fontSize: 8,
        fontFamily: FONT, color: rarityColor, letterSpacing: 2,
      }}>{rarity}</div>}
      <div style={{ padding: "6px 8px", backgroundColor: `${C.void}dd` }}>
        <div style={{ fontFamily: FONT, fontSize: Math.min(9, size / 25), color: dead ? C.spirit : reborn ? C.gold : C.white, textAlign: "center", marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: chainColor }} />
          <span style={{ fontFamily: FONT, fontSize: 7, color: chainColor }}>{chainLabel}</span>
        </div>
      </div>
      {dead && <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)", zIndex: 10,
      }}>
        <PxText text="DEAD" size={20} color={C.crimson} />
      </div>}
      {reborn && ["✦", "✧", "✦", "✧"].map((s, i) => (
        <span key={i} style={{
          position: "absolute", fontSize: 10, color: C.gold,
          opacity: 0.5 + Math.sin(frame * 0.1 + i * 1.5) * 0.4,
          textShadow: `0 0 6px ${C.gold}`,
          ...(i < 2 ? { top: 4 } : { bottom: 4 }),
          ...(i % 2 === 0 ? { left: 6 } : { right: 6 }),
        }}>{s}</span>
      ))}
      {["ᚠ", "ᚢ", "ᚦ", "ᚨ"].map((r, i) => (
        <span key={`r${i}`} style={{
          position: "absolute", fontSize: 7, color: `${chainColor}55`,
          ...(i < 2 ? { top: rarity ? 30 : 6 } : { bottom: 30 }),
          ...(i % 2 === 0 ? { left: 4 } : { right: 4 }),
        }}>{r}</span>
      ))}
    </NESBox>
  );
};

// ============================================================================
// RUNE DISSOLVE
// ============================================================================
const RuneDissolve: React.FC<{
  count: number; cx: number; cy: number; radius: number; progress: number; color: string;
}> = ({ count, cx, cy, radius, progress, color }) => {
  const frame = useCurrentFrame();
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ◆✦◈梵";
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    angle: random(`da-${i}`) * Math.PI * 2,
    dist: random(`dd-${i}`),
    rune: runes[Math.floor(random(`dr-${i}`) * runes.length)],
    size: 10 + random(`ds-${i}`) * 18,
    spin: (random(`dsp-${i}`) - 0.5) * 5,
    delay: random(`del-${i}`) * 0.3,
  })), [count]);

  return <>{particles.map((p, i) => {
    const adj = Math.max(0, Math.min(1, (progress - p.delay) / (1 - p.delay)));
    const d = p.dist * radius * adj;
    const spiralAngle = p.angle + adj * 2;
    const x = cx + Math.cos(spiralAngle) * d;
    const y = cy + Math.sin(spiralAngle) * d;
    const op = adj < 0.1 ? adj * 10 : adj > 0.7 ? (1 - adj) / 0.3 : 1;
    return <span key={i} style={{
      position: "absolute", left: x, top: y,
      fontFamily: "serif", fontSize: p.size, color,
      opacity: op * 0.8, transform: `rotate(${frame * p.spin}deg)`,
      textShadow: `0 0 10px ${color}, 0 0 20px ${color}66`,
      pointerEvents: "none",
    }}>{p.rune}</span>;
  })}</>;
};

// ============================================================================
// CHAINS
// ============================================================================
const CHAINS = [
  { name: "Ethereum", color: "#627EEA" }, { name: "Polygon", color: "#8247E5" },
  { name: "Arbitrum", color: "#28A0F0" }, { name: "Base", color: "#0052FF" },
  { name: "Optimism", color: "#FF0420" }, { name: "BNB", color: "#F0B90B" },
  { name: "Avalanche", color: "#E84142" }, { name: "Sui", color: "#6FBCF0" },
  { name: "Aptos", color: "#2AAAC2" }, { name: "NEAR", color: "#00C08B" },
  { name: "Solana", color: "#9945FF" }, { name: "Fantom", color: "#1969FF" },
  { name: "Moonbeam", color: "#53CBC8" }, { name: "Celo", color: "#35D07F" },
  { name: "Scroll", color: "#EBC28E" }, { name: "Blast", color: "#FCFC03" },
  { name: "Linea", color: "#61DFFF" }, { name: "Gnosis", color: "#3E6957" },
];

// ============================================================================
// SCENE 1: THE PROBLEM — Dead communities, lost identity (0-8s, 0-240f)
// Emotional hook. Not tech. Identity.
// ============================================================================
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();

  const bgOp = interpolate(frame, [0, 40], [0, 0.12], { extrapolateRight: "clamp" });

  // Dialogue 1: The loss
  const d1Text = "Your favorite collection is dead. The devs are gone. The floor is zero.";
  const d1Progress = interpolate(frame, [15, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d1Op = interpolate(frame, [10, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d1Exit = interpolate(frame, [115, 122], [1, 0], { extrapolateRight: "clamp" });

  // Dialogue 2: The identity
  const d2Text = "But that PFP is still you. Your identity. Your community.";
  const d2Progress = interpolate(frame, [128, 200], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d2Op = interpolate(frame, [125, 132], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d2Exit = interpolate(frame, [215, 225], [1, 0], { extrapolateRight: "clamp" });

  // Dead NFT cards in background
  const deadCards = [
    { img: "nfts/bayc8817.png", x: 15, y: 25 },
    { img: "nfts/milady4269.png", x: 65, y: 20 },
    { img: "nfts/madlad4200.png", x: 40, y: 35 },
  ];

  const cardsOp = interpolate(frame, [20, 50], [0, 0.4], { extrapolateRight: "clamp" });
  const cardsFade = interpolate(frame, [80, 110], [1, 0.3], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <Img src={staticFile("art/hero-wide.png")} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", opacity: bgOp, filter: "saturate(0.15) brightness(0.25)",
        imageRendering: "pixelated",
      }} />

      <StarField density={50} />

      {/* Dead NFT cards scattered, greyed out */}
      {deadCards.map((card, i) => (
        <div key={i} style={{
          position: "absolute", left: `${card.x}%`, top: `${card.y}%`,
          transform: `rotate(${(i - 1) * 8}deg)`,
          opacity: cardsOp * cardsFade,
        }}>
          <NFTCard image={card.img} label="" chainLabel="" chainColor={C.spirit}
            size={140} dead />
        </div>
      ))}

      <Orbs count={10} color={C.crimson} speed={0.2} size={2} />

      {/* Dialogues — CENTERED */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {frame < 125 && (
          <div style={{ opacity: d1Op * d1Exit }}>
            <JRPGDialogue text={d1Text} progress={d1Progress} />
          </div>
        )}
        {frame >= 123 && (
          <div style={{ opacity: d2Op * d2Exit }}>
            <JRPGDialogue text={d2Text} progress={d2Progress} variant="dramatic" />
          </div>
        )}
      </div>

      <GlitchBar active={frame > 70 && frame < 90} />
      <CRT intensity={1} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 2: EMPOWERMENT — "You can bring it back" + Summoning (8-16s, 240-480f)
// ============================================================================
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Dialogue: empowerment
  const d1Text = "What if you could bring it back to life?";
  const d1Progress = interpolate(frame, [10, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d1Op = interpolate(frame, [5, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d1Exit = interpolate(frame, [80, 88], [1, 0], { extrapolateRight: "clamp" });

  // Summoning circle builds
  const circleProgress = interpolate(frame, [50, 160], [0, 1], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) });
  const circleScale = interpolate(frame, [50, 130], [0.15, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.ease) });
  const energy = interpolate(frame, [130, 170], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // FLASH + mascot rise
  const flashAt = 175;
  const isFlash = frame >= flashAt && frame <= flashAt + 15;
  const mascotY = interpolate(frame, [flashAt, flashAt + 25], [300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.8)),
  });
  const mascotOp = interpolate(frame, [flashAt, flashAt + 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const mascotScale = frame > flashAt
    ? interpolate(frame, [flashAt, flashAt + 15], [2, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.ease) }) : 0;
  const mascotGlow = frame > flashAt ? 25 + Math.sin(frame * 0.08) * 18 : 0;

  // Title
  const titleChars = ["イ", "カ", "転", "生"];
  const titleStart = flashAt + 28;
  const subOp = interpolate(frame, [titleStart + 35, titleStart + 50], [0, 1], { extrapolateRight: "clamp" });

  const shaking = frame >= flashAt && frame <= flashAt + 12;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <Img src={staticFile("art/summoning-circle.png")} style={{
        position: "absolute", top: "50%", left: "50%",
        width: 1000, height: 1000, marginLeft: -500, marginTop: -500,
        opacity: interpolate(frame, [50, 100], [0, 0.08], { extrapolateRight: "clamp" }),
        transform: `rotate(${frame * 0.15}deg)`, imageRendering: "pixelated",
      }} />

      <StarField density={40} />
      <Orbs count={Math.floor(8 + energy * 60)} color={C.pink} speed={0.5 + energy * 3} size={3 + energy * 5} />
      <Orbs count={Math.floor(5 + energy * 20)} color={C.gold} speed={0.3 + energy * 1.5} size={2 + energy * 3} />

      {/* Energy rings */}
      {energy > 0.5 && Array.from({ length: 3 }).map((_, i) => {
        const rp = ((frame - 135 + i * 10) % 30) / 30;
        return <div key={`ring-${i}`} style={{
          position: "absolute", top: "50%", left: "50%",
          width: rp * 800, height: rp * 800,
          marginLeft: -rp * 400, marginTop: -rp * 400,
          borderRadius: "50%", border: `2px solid ${C.gold}`,
          opacity: (1 - rp) * 0.3 * energy,
        }} />;
      })}

      {/* Converging beams */}
      {energy > 0.2 && [30, 40, 50, 60, 70].map((y, i) => (
        <div key={`beam-${i}`} style={{
          position: "absolute", top: `${y}%`, left: 0, width: "100%", height: 1,
          background: `linear-gradient(90deg, transparent ${50 - energy * 35}%, ${[C.pink, C.gold, C.cyan, C.pink, C.gold][i]} 50%, transparent ${50 + energy * 35}%)`,
          opacity: (energy - 0.2) * 0.5,
        }} />
      ))}

      {/* Dialogue at top */}
      {frame < 90 && (
        <div style={{
          position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)",
          opacity: d1Op * d1Exit,
        }}>
          <JRPGDialogue text={d1Text} progress={d1Progress} variant="dramatic" />
        </div>
      )}

      {/* Summoning circle + mascot */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transform: shaking ? `translate(${(random(`sx-${frame}`) - 0.5) * 18}px, ${(random(`sy-${frame}`) - 0.5) * 18}px)` : undefined,
      }}>
        {frame >= 50 && <div style={{ position: "absolute", transform: `scale(${circleScale})` }}>
          <RitualCircle size={650} progress={circleProgress} />
        </div>}

        <div style={{
          transform: `translateY(${mascotY}px) scale(${mascotScale})`,
          opacity: mascotOp,
          filter: `drop-shadow(0 0 ${mascotGlow}px ${C.pink}) drop-shadow(0 0 ${mascotGlow * 2}px ${C.pink}44)`,
        }}>
          <Img src={staticFile("art/ika-mascot-v2.png")} width={300} height={300} style={{ imageRendering: "pixelated" }} />
        </div>
      </div>

      {/* Title chars */}
      <div style={{
        position: "absolute", bottom: 130, width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 20,
      }}>
        {titleChars.map((ch, i) => {
          const s = spring({ frame: frame - titleStart - i * 6, fps, config: { damping: 7, stiffness: 120 } });
          return <div key={i} style={{
            transform: `scale(${interpolate(s, [0, 1], [4, 1])})`,
            opacity: Math.min(1, s * 2),
          }}>
            <PxText text={ch} size={88} color={C.gold} jp />
          </div>;
        })}
      </div>
      <div style={{ position: "absolute", bottom: 85, width: "100%", textAlign: "center", opacity: subOp }}>
        <PxText text="IKA TENSEI" size={20} color={C.pink} spacing={12} />
      </div>

      {isFlash && <div style={{
        position: "absolute", inset: 0, zIndex: 160, backgroundColor: "#fff",
        opacity: interpolate(frame, [flashAt, flashAt + 15], [1, 0]),
      }} />}

      <GlitchBar active={frame >= flashAt && frame <= flashAt + 20} />
      <CRT intensity={0.7} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 3: TRANSFORMATION — NFT dissolves → reborn (16-23s, 480-690f)
// ============================================================================
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardEntry = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  const shakeIntensity = interpolate(frame, [40, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardShaking = frame >= 40 && frame < 95;
  const runeBuildup = interpolate(frame, [50, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dissolveProgress = interpolate(frame, [85, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardOpacity = interpolate(frame, [85, 105], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const convergeProgress = interpolate(frame, [118, 138], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const coreGlow = interpolate(frame, [125, 138], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rebornFlash = frame >= 138 && frame <= 152;
  const rebornEntry = spring({ frame: frame - 145, fps, config: { damping: 5, stiffness: 50 } });
  const shockwaveProgress = interpolate(frame, [140, 165], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dText = "Sealed and reborn. Your identity, restored.";
  const dStart = 170;
  const dProgress = interpolate(frame, [dStart, dStart + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const cx = 960;
  const cy = 370;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={30} />
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -55%)",
        opacity: 0.04 + runeBuildup * 0.08,
      }}>
        <RitualCircle size={800} progress={runeBuildup} glowColor={C.crimson} />
      </div>
      <Orbs count={Math.floor(10 + dissolveProgress * 40)} color={C.gold} speed={0.5 + dissolveProgress * 3} size={3 + dissolveProgress * 4} />

      {/* Source card */}
      {frame < 115 && (
        <div style={{
          position: "absolute", left: cx - 110, top: cy - 160,
          transform: `scale(${cardEntry})`, opacity: cardOpacity * cardEntry,
        }}>
          <div style={{
            transform: cardShaking ? `translate(${(random(`cs-${frame}`) - 0.5) * shakeIntensity * 16}px, ${(random(`csy-${frame}`) - 0.5) * shakeIntensity * 16}px) rotate(${(random(`csr-${frame}`) - 0.5) * shakeIntensity * 4}deg)` : undefined,
          }}>
            <NFTCard image="nfts/azuki9605.png" label="Azuki #9605"
              chainLabel="ETHEREUM" chainColor="#627EEA" size={220}
              rarity="LEGENDARY" rarityColor={C.pink} />
          </div>
        </div>
      )}

      {/* Dissolve */}
      {frame >= 70 && frame < 120 && (
        <RuneDissolve count={70} cx={cx} cy={cy}
          radius={300 + dissolveProgress * 200}
          progress={dissolveProgress > 0 ? dissolveProgress : runeBuildup * 0.3}
          color={C.gold} />
      )}

      {/* Converge */}
      {frame >= 118 && frame < 142 && (
        <RuneDissolve count={50} cx={cx} cy={cy}
          radius={350 * (1 - convergeProgress)}
          progress={convergeProgress > 0.5 ? 1 - convergeProgress : convergeProgress * 2}
          color={C.pink} />
      )}

      {/* Core energy */}
      {coreGlow > 0 && (
        <div style={{
          position: "absolute", left: cx - 30, top: cy - 30,
          width: 60, height: 60, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.gold} 0%, ${C.pink}88 40%, transparent 70%)`,
          opacity: coreGlow,
          transform: `scale(${0.5 + coreGlow * 1.5})`,
          boxShadow: `0 0 ${40 * coreGlow}px ${C.gold}, 0 0 ${80 * coreGlow}px ${C.pink}66`,
        }} />
      )}

      {/* Shockwave */}
      {shockwaveProgress > 0 && shockwaveProgress < 1 && (
        <div style={{
          position: "absolute", left: cx, top: cy,
          width: shockwaveProgress * 1600, height: shockwaveProgress * 1600,
          marginLeft: -shockwaveProgress * 800, marginTop: -shockwaveProgress * 800,
          borderRadius: "50%", border: `3px solid ${C.gold}`,
          opacity: (1 - shockwaveProgress) * 0.6,
          boxShadow: `0 0 30px ${C.gold}44`,
        }} />
      )}

      {/* Reborn card */}
      {frame >= 145 && (
        <div style={{
          position: "absolute", left: cx - 110, top: cy - 160,
          transform: `scale(${rebornEntry})`, opacity: rebornEntry,
        }}>
          <NFTCard image="nfts/azuki9605.png" label="Azuki #9605 ✦ Reborn"
            chainLabel="SOLANA" chainColor="#9945FF" size={220}
            rarity="LEGENDARY" rarityColor={C.gold} reborn />
        </div>
      )}

      {rebornFlash && <div style={{
        position: "absolute", inset: 0, zIndex: 150, backgroundColor: C.gold,
        opacity: interpolate(frame, [138, 152], [1, 0]),
      }} />}

      {frame >= dStart - 5 && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", opacity: dOp,
        }}>
          <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
        </div>
      )}

      <GlitchBar active={frame >= 85 && frame < 100} />
      <CRT intensity={0.6 + shakeIntensity * 0.6} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 4: COMMUNITY POWER — The guild value prop (23-32s, 690-960f)
// SLOW. Give people time to read. This is the sell.
// ============================================================================
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: "DEAD COLLECTIONS" (0-50)
  const deadOp = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" });
  const deadExit = interpolate(frame, [50, 58], [1, 0], { extrapolateRight: "clamp" });

  // Phase 2: "RESURRECTED BY YOU" (40-90)
  const resOp = interpolate(frame, [45, 58], [0, 1], { extrapolateRight: "clamp" });
  const resExit = interpolate(frame, [90, 98], [1, 0], { extrapolateRight: "clamp" });

  // Phase 3: Flow diagram (70-200) — THIS IS SLOW on purpose
  const flowOp = interpolate(frame, [75, 90], [0, 1], { extrapolateRight: "clamp" });

  const flowItems = [
    { label: "DEAD COLLECTION", sub: "ABANDONED BY DEVS", icon: "💀", color: C.crimson, delay: 80 },
    { label: "COMMUNITY SEALS", sub: "GUILD VOTES TO ADOPT", icon: "🗳", color: C.gold, delay: 105 },
    { label: "ROYALTIES FLOW", sub: "TO NFT HOLDERS", icon: "💰", color: C.green, delay: 130 },
  ];

  // Pills
  const pillsOp = interpolate(frame, [155, 170], [0, 1], { extrapolateRight: "clamp" });

  // Dialogue — MORE TIME
  const dText = "Dead collections reborn. Royalties to holders. The community decides everything.";
  const dStart = 180;
  const dProgress = interpolate(frame, [dStart, dStart + 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={40} />
      <Orbs count={15} color={C.gold} speed={0.4} size={3} />

      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.04 }}>
        <RitualCircle size={600} progress={1} />
      </div>

      {/* Phase 1: DEAD COLLECTIONS */}
      {frame < 60 && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          opacity: deadOp * deadExit,
        }}>
          <PxText text="DEAD COLLECTIONS" size={56} color={C.crimson} shake={frame < 30} />
        </div>
      )}

      {/* Phase 2: RESURRECTED BY YOU */}
      {frame >= 42 && frame < 100 && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          opacity: resOp * resExit,
        }}>
          <PxText text="RESURRECTED" size={56} color={C.green} />
          <div style={{ height: 14 }} />
          <PxText text="BY YOU" size={28} color={C.gold} />
        </div>
      )}

      {/* Phase 3: Flow diagram */}
      {frame >= 75 && (
        <>
          <div style={{
            position: "absolute", top: 60, width: "100%",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: flowOp,
          }}>
            <Img src={staticFile("art/guild-banner.png")} width={70} height={70}
              style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 15px ${C.gold}44)` }} />
            <PxText text="THE GUILD" size={24} color={C.gold} />
          </div>

          <div style={{
            position: "absolute", top: "38%", left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 28,
          }}>
            {flowItems.map((item, i) => {
              const s = spring({ frame: frame - item.delay, fps, config: { damping: 12, stiffness: 80 } });
              return <React.Fragment key={i}>
                {i > 0 && (
                  <div style={{ opacity: s, fontSize: 32, color: C.gold, textShadow: `0 0 10px ${C.gold}` }}>→</div>
                )}
                <NESBox width={260} borderColor={`${item.color}66`} bgColor={`${item.color}08`}
                  style={{
                    transform: `scale(${s}) translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: "20px 14px", gap: 10,
                  }}>
                  <span style={{ fontSize: 36 }}>{item.icon}</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: item.color, textAlign: "center" }}>{item.label}</span>
                  <span style={{ fontFamily: FONT, fontSize: 9, color: C.spirit, textAlign: "center" }}>{item.sub}</span>
                </NESBox>
              </React.Fragment>;
            })}
          </div>

          {/* Feature pills */}
          <div style={{
            position: "absolute", bottom: 170, width: "100%",
            display: "flex", justifyContent: "center", gap: 20, opacity: pillsOp,
          }}>
            {["DAO VOTING", "TREASURY", "ROYALTY SPLITS", "GOVERNANCE"].map((feat) => (
              <NESBox key={feat} width="auto" borderColor={`${C.gold}44`} bgColor={`${C.gold}08`}
                style={{ padding: "6px 16px" }}>
                <span style={{ fontFamily: FONT, fontSize: 9, color: C.gold }}>{feat}</span>
              </NESBox>
            ))}
          </div>
        </>
      )}

      {/* Dialogue */}
      {frame >= dStart - 5 && (
        <div style={{
          position: "absolute", bottom: 35, left: "50%", transform: "translateX(-50%)", opacity: dOp,
        }}>
          <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
        </div>
      )}

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 5: YOUR COLLECTION — NFTs reborn, unified (32-38s, 960-1140f)
// ============================================================================
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" });

  const nfts = [
    { img: "nfts/bayc8817.png", label: "BAYC #8817", cc: "#627EEA", r: "LEGENDARY", rc: C.pink },
    { img: "nfts/milady4269.png", label: "Milady #4269", cc: "#627EEA", r: "EPIC", rc: C.gold },
    { img: "nfts/pudgy6529.png", label: "Pudgy #6529", cc: "#627EEA", r: "EPIC", rc: C.gold },
    { img: "nfts/madlad4200.png", label: "Mad Lad #4200", cc: "#9945FF", r: "RARE", rc: "#C0C0C0" },
  ];

  const reborn = interpolate(frame, [70, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dText = "One gallery. Every chain. All yours.";
  const dStart = 100;
  const dProgress = interpolate(frame, [dStart, dStart + 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={40} />
      <Orbs count={15} color={C.gold} speed={0.4} size={2} />

      <div style={{ position: "absolute", top: 50, width: "100%", textAlign: "center", opacity: titleOp }}>
        <PxText text="YOUR COLLECTION" size={28} color={C.pink} />
        <div style={{ height: 8 }} />
        {reborn > 0
          ? <PxText text="ALL REBORN ON SOLANA  ✦" size={14} color={C.green} opacity={reborn} />
          : <PxText text="From any chain..." size={12} color={C.spirit} glow={false} />
        }
      </div>

      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -45%)",
        display: "flex", gap: 20, alignItems: "flex-end",
      }}>
        {nfts.map((nft, i) => {
          const s = spring({ frame: frame - 10 - i * 8, fps, config: { damping: 10, stiffness: 80 } });
          return <div key={i} style={{
            transform: `scale(${s}) translateY(${i === 1 || i === 2 ? -12 : 0}px)`,
            opacity: s,
          }}>
            <NFTCard image={nft.img} label={nft.label}
              chainLabel={reborn > 0 ? "SOLANA" : "ETH"}
              chainColor={reborn > 0 ? "#9945FF" : nft.cc}
              size={190} rarity={nft.r} rarityColor={nft.rc}
              reborn={reborn > 0} />
          </div>;
        })}
      </div>

      {frame >= 68 && frame <= 78 && <div style={{
        position: "absolute", inset: 0, backgroundColor: C.gold, zIndex: 150,
        opacity: interpolate(frame, [68, 78], [0.5, 0]),
      }} />}

      {frame >= dStart - 5 && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", opacity: dOp,
        }}>
          <JRPGDialogue text={dText} progress={dProgress} />
        </div>
      )}

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 6: FINALE (38-45s, 1140-1350f)
// ============================================================================
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mascotSlam = spring({ frame: frame - 5, fps, config: { damping: 5, stiffness: 70 } });
  const mascotScale = interpolate(mascotSlam, [0, 1], [6, 1]);
  const slamFlash = frame >= 5 && frame <= 16;

  const titleOp = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [35, 48], [0, 1], { extrapolateRight: "clamp" });

  const dText = "Your NFTs deserve better. Let's begin.";
  const dStart = 55;
  const dProgress = interpolate(frame, [dStart, dStart + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const ctaOp = interpolate(frame, [120, 135], [0, 1], { extrapolateRight: "clamp" });
  const ctaPulse = 1 + Math.sin(frame * 0.1) * 0.03;
  const mascotGlow = 25 + Math.sin(frame * 0.06) * 18;
  const poweredOp = interpolate(frame, [145, 160], [0, 1], { extrapolateRight: "clamp" });

  // Tech features as subtle pills
  const techOp = interpolate(frame, [135, 148], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.06 }}>
        <RitualCircle size={1000} progress={1} glowColor={C.pink} />
      </div>

      <StarField density={60} />
      <Orbs count={80} color={C.pink} speed={1.5} size={4} />
      <Orbs count={40} color={C.gold} speed={0.8} size={3} />
      <Orbs count={20} color={C.cyan} speed={0.6} size={2} />

      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transform: slamFlash ? `translate(${(random(`fx-${frame}`) - 0.5) * 14}px, ${(random(`fy-${frame}`) - 0.5) * 14}px)` : undefined,
      }}>
        <div style={{
          transform: `scale(${mascotScale * mascotSlam})`, opacity: mascotSlam,
          filter: `drop-shadow(0 0 ${mascotGlow}px ${C.pink}) drop-shadow(0 0 ${mascotGlow * 1.5}px ${C.pink}44)`,
          marginBottom: 16,
        }}>
          <Img src={staticFile("art/ika-mascot-v2.png")} width={200} height={200} style={{ imageRendering: "pixelated" }} />
        </div>

        <div style={{ opacity: titleOp }}>
          <PxText text="イカ転生" size={72} color={C.gold} jp />
        </div>
        <div style={{ height: 6 }} />
        <div style={{ opacity: subOp }}>
          <PxText text="IKA TENSEI" size={20} color={C.pink} spacing={12} />
        </div>

        {frame >= dStart - 5 && (
          <div style={{ marginTop: 24, opacity: dOp }}>
            <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
          </div>
        )}

        {/* Tech features as subtle secondary info */}
        <div style={{ display: "flex", gap: 16, marginTop: 20, opacity: techOp * 0.6 }}>
          {["ANY CHAIN", "NO BRIDGES", "PERMANENT STORAGE"].map((t) => (
            <NESBox key={t} width="auto" borderColor={`${C.spirit}44`} bgColor={`${C.spirit}08`}
              style={{ padding: "4px 12px" }}>
              <span style={{ fontFamily: FONT, fontSize: 7, color: C.spirit }}>{t}</span>
            </NESBox>
          ))}
        </div>

        <div style={{ marginTop: 20, opacity: ctaOp, transform: `scale(${ctaPulse})` }}>
          <NESBox width={420} borderColor={C.pink} bgColor={`${C.pink}15`} glow={`${C.pink}44`}
            style={{ padding: "14px 0", textAlign: "center" }}>
            <PxText text="✦  BEGIN THE RITUAL  ✦" size={16} color={C.pink} />
          </NESBox>
        </div>

        <div style={{ marginTop: 14, opacity: poweredOp * 0.4 }}>
          <PxText text="POWERED BY IKA \u00d7 DWALLET NETWORK" size={8} color={C.spirit} glow={false} />
        </div>
      </div>

      {slamFlash && <div style={{
        position: "absolute", inset: 0, backgroundColor: C.pink, zIndex: 150,
        opacity: interpolate(frame, [5, 16], [0.8, 0]),
      }} />}

      <GlitchBar active={frame >= 5 && frame <= 20} />
      <CRT intensity={0.7} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// FLASH CUT
// ============================================================================
const FlashCut: React.FC<{ at: number; color: string; duration?: number }> = ({ at, color, duration = 8 }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2 || frame > at + duration) return null;
  if (frame < at) return <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", zIndex: 300 }} />;
  return <div style={{
    position: "absolute", inset: 0, zIndex: 300, backgroundColor: color,
    opacity: interpolate(frame, [at, at + duration], [0.9, 0]),
  }} />;
};

// ============================================================================
// MAIN — 45s @ 30fps = 1350 frames
//
// Scene 1: The Problem — dead communities         0-240    (8s)
// Scene 2: Empowerment + Summoning               240-480   (8s)
// Scene 3: Transformation                        480-690   (7s)
// Scene 4: Community Power — the guild sell       690-960   (9s) ← SLOW
// Scene 5: Your Collection                        960-1140  (6s)
// Scene 6: Finale                                1140-1350  (7s)
// ============================================================================
export const IkaTenseiTrailer: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.deep }}>
    <Sequence from={0} durationInFrames={240}><Scene1 /></Sequence>
    <Sequence from={240} durationInFrames={240}><Scene2 /></Sequence>
    <Sequence from={480} durationInFrames={210}><Scene3 /></Sequence>
    <Sequence from={690} durationInFrames={270}><Scene4 /></Sequence>
    <Sequence from={960} durationInFrames={180}><Scene5 /></Sequence>
    <Sequence from={1140} durationInFrames={210}><Scene6 /></Sequence>

    <FlashCut at={240} color={C.pink} />
    <FlashCut at={480} color={C.gold} />
    <FlashCut at={690} color={C.cyan} duration={6} />
    <FlashCut at={960} color={C.gold} duration={6} />
    <FlashCut at={1140} color={C.pink} />
  </AbsoluteFill>
);
