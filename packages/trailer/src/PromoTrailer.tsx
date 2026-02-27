import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
  random,
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
// BASS PULSE — synchronized oscillation across elements
// ============================================================================
const useBass = (bpm = 120) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beatFrames = (60 / bpm) * fps;
  const beatPhase = (frame % beatFrames) / beatFrames;
  const pulse = Math.pow(Math.sin(beatPhase * Math.PI), 2);
  const subPulse = Math.sin(frame * 0.08) * 0.5 + 0.5;
  return { pulse, subPulse, beatPhase };
};

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

const GlitchBar: React.FC<{ active: boolean; intensity?: number }> = ({ active, intensity = 1 }) => {
  const frame = useCurrentFrame();
  if (!active || frame % 7 > 2) return null;
  const bars = Math.floor(1 + random(`gbc-${frame}`) * 2 * intensity);
  return <>{Array.from({ length: bars }, (_, bi) => {
    const y = random(`gb-${frame}-${bi}`) * 100;
    const h = 2 + random(`gbh-${frame}-${bi}`) * 6 * intensity;
    return <div key={bi} style={{
      position: "absolute", left: 0, right: 0, top: `${y}%`, height: h,
      backgroundColor: bi % 2 === 0 ? `${C.pink}33` : `${C.cyan}22`, zIndex: 185, pointerEvents: "none",
      transform: `translateX(${(random(`gbx-${frame}-${bi}`) - 0.5) * 20 * intensity}px)`,
    }} />;
  })}</>;
};

// Chromatic aberration effect
const ChromaticAberration: React.FC<{ amount?: number }> = ({ amount = 3 }) => {
  return <div style={{
    position: "absolute", inset: 0, zIndex: 188, pointerEvents: "none",
    boxShadow: `inset ${amount}px 0 0 ${C.pink}15, inset -${amount}px 0 0 ${C.cyan}15`,
    mixBlendMode: "screen",
  }} />;
};

// ============================================================================
// ORBS + STARS
// ============================================================================
const Orbs: React.FC<{ count: number; color: string; speed?: number; size?: number; bassMultiplier?: number }> = ({ count, color, speed = 1, size = 4, bassMultiplier = 0 }) => {
  const frame = useCurrentFrame();
  const { pulse } = useBass();
  const orbs = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: random(`ox-${i}`) * 100, y: random(`oy-${i}`) * 100,
    s: size * (0.5 + random(`os-${i}`)), phase: random(`op-${i}`) * Math.PI * 2,
    spd: (0.5 + random(`osp-${i}`) * 1.5) * speed,
  })), [count, size, speed]);
  return <>{orbs.map((o, i) => {
    const x = o.x + Math.sin(frame * 0.015 * o.spd + o.phase) * 8;
    const y = (o.y - frame * 0.3 * o.spd + 120) % 120 - 10;
    const sizeBoost = 1 + pulse * bassMultiplier;
    return <div key={i} style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      width: o.s * sizeBoost, height: o.s * sizeBoost, borderRadius: "50%",
      backgroundColor: color, opacity: 0.25 + Math.sin(frame * 0.04 + o.phase) * 0.25,
      boxShadow: `0 0 ${o.s * 3 * sizeBoost}px ${color}, 0 0 ${o.s * 6 * sizeBoost}px ${color}66`,
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

// Energy beams radiating from center
const EnergyBeams: React.FC<{ count?: number; color?: string; intensity?: number }> = ({ count = 8, color = C.gold, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { pulse } = useBass();
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360 + frame * 0.4;
        const rad = (angle * Math.PI) / 180;
        const length = 1200 * intensity * (0.7 + pulse * 0.3);
        const x2 = 960 + Math.cos(rad) * length;
        const y2 = 540 + Math.sin(rad) * length;
        return <line key={i}
          x1="960" y1="540" x2={x2} y2={y2}
          stroke={color}
          strokeWidth={1.5 + pulse * 2}
          opacity={0.15 + pulse * 0.25 * intensity}
          style={{ mixBlendMode: "screen" }}
        />;
      })}
    </svg>
  </div>;
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
  opacity?: number; spacing?: number; bassScale?: number;
}> = ({ text, size, color, glow = true, shake = false, jp = false, opacity = 1, spacing, bassScale = 0 }) => {
  const frame = useCurrentFrame();
  const { pulse } = useBass();
  const sx = shake ? (random(`stx-${frame}`) - 0.5) * 8 : 0;
  const sy = shake ? (random(`sty-${frame}`) - 0.5) * 8 : 0;
  const scale = 1 + pulse * bassScale;
  return <div style={{
    fontFamily: jp ? FONT_JP : FONT, fontSize: size,
    fontWeight: jp ? 900 : undefined, color, opacity,
    textShadow: glow ? `0 0 ${size * 0.5}px ${color}, 0 0 ${size}px ${color}44, 0 4px 12px rgba(0,0,0,0.9)` : `0 4px 12px rgba(0,0,0,0.9)`,
    textAlign: "center", lineHeight: 1.3,
    letterSpacing: spacing ?? (jp ? 10 : 2),
    transform: `translate(${sx}px, ${sy}px) scale(${scale})`,
  }}>{text}</div>;
};

// ============================================================================
// RITUAL CIRCLE — enhanced with more beams
// ============================================================================
const RitualCircle: React.FC<{
  size: number; progress: number; glowColor?: string;
  enhanced?: boolean;
}> = ({ size, progress, glowColor = C.gold, enhanced = false }) => {
  const frame = useCurrentFrame();
  const { pulse } = useBass();
  const p = Math.sin(frame * 0.06) * 0.15 + pulse * 0.1;
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛏᛒᛖᛗᛚᛝᛞᛟ";
  return <div style={{ width: size, height: size, position: "relative" }}>
    <svg viewBox="0 0 200 200" width={size} height={size}
      style={{ filter: `drop-shadow(0 0 ${(enhanced ? 25 : 15) + p * 35}px ${glowColor}${enhanced ? "99" : "66"})` }}>
      {/* Outer rings */}
      <circle cx="100" cy="100" r="96" fill="none" stroke={glowColor}
        strokeWidth={enhanced ? "2.5" : "1.5"} opacity={0.6 + p}
        strokeDasharray={`${progress * 603} 603`}
        transform={`rotate(${frame * 0.3}, 100, 100)`} />
      <circle cx="100" cy="100" r="72" fill="none" stroke={C.pink}
        strokeWidth={enhanced ? "1.5" : "1"} opacity={0.4 + p} strokeDasharray={`${progress * 452} 452`}
        transform={`rotate(${-frame * 0.2}, 100, 100)`} />
      <circle cx="100" cy="100" r="50" fill="none" stroke={glowColor}
        strokeWidth="0.6" opacity={0.3 + p}
        strokeDasharray={`${progress * 314} 314`}
        transform={`rotate(${frame * 0.4}, 100, 100)`} />
      {/* Extra rings when enhanced */}
      {enhanced && <>
        <circle cx="100" cy="100" r="87" fill="none" stroke={C.cyan}
          strokeWidth="0.8" opacity={0.25 + p * 0.5}
          strokeDasharray={`${progress * 547} 547`}
          transform={`rotate(${frame * 0.15}, 100, 100)`} />
        <circle cx="100" cy="100" r="62" fill="none" stroke={C.cyan}
          strokeWidth="0.6" opacity={0.2 + p * 0.4}
          transform={`rotate(${-frame * 0.25}, 100, 100)`} />
      </>}
      {/* Triangles */}
      <polygon points="100,15 165,143 35,143" fill="none" stroke={glowColor}
        strokeWidth="1.2" opacity={(0.5 + p) * Math.min(1, progress * 2)}
        transform={`rotate(${frame * 0.15}, 100, 100)`} />
      <polygon points="100,185 35,57 165,57" fill="none" stroke={glowColor}
        strokeWidth="1.2" opacity={(0.5 + p) * Math.min(1, progress * 2)}
        transform={`rotate(${-frame * 0.15}, 100, 100)`} />
      {enhanced && <>
        <polygon points="100,20 170,150 30,150" fill="none" stroke={C.pink}
          strokeWidth="0.7" opacity={(0.3 + p * 0.5) * Math.min(1, progress * 2)}
          transform={`rotate(${frame * 0.08 + 30}, 100, 100)`} />
      </>}
      {/* Runes */}
      {Array.from({ length: enhanced ? 24 : 16 }).map((_, i) => {
        const a = (i / (enhanced ? 24 : 16)) * Math.PI * 2 + frame * 0.008;
        return <text key={i}
          x={100 + 85 * Math.cos(a)} y={100 + 85 * Math.sin(a)}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={enhanced ? "6" : "7"} fill={glowColor} opacity={progress * (enhanced ? 24 : 16) > i ? 0.5 + p : 0}
          style={{ fontFamily: "serif" }}
        >{runes[i % runes.length]}</text>;
      })}
      {/* Inner beams */}
      {enhanced && Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + frame * 0.02;
        const x2 = 100 + 94 * Math.cos(a);
        const y2 = 100 + 94 * Math.sin(a);
        return <line key={i} x1="100" y1="100" x2={x2} y2={y2}
          stroke={C.cyan} strokeWidth={0.5 + p * 1.5} opacity={0.3 + p * 0.5} />;
      })}
      {/* Core */}
      <circle cx="100" cy="100" r={6 + p * 10} fill={C.pink} opacity={0.5 + p * 0.5} />
      <circle cx="100" cy="100" r={3 + p * 5} fill={C.gold} opacity={0.8} />
      {enhanced && <circle cx="100" cy="100" r={1.5 + p * 2} fill={C.white} opacity={1} />}
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
        <div style={{
          display: "flex", justifyContent: "center", gap: 6, alignItems: "center",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: chainColor }} />
          <span style={{ fontFamily: FONT, fontSize: 7, color: chainColor }}>{chainLabel}</span>
        </div>
      </div>
    </NESBox>
  );
};

// ============================================================================
// SCENE 1: THE PROBLEM — dead communities (0-240f, 8s)
// ============================================================================
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pulse } = useBass();

  const titleOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });

  const nfts = [
    { img: "nfts/bayc8817.png", label: "BAYC #8817", delay: 54 },
    { img: "nfts/azuki9605.png", label: "Azuki #9605", delay: 72 },
    { img: "nfts/milady4269.png", label: "Milady #4269", delay: 90 },
  ];

  const dText = "Another NFT collection... abandoned by its creators.";
  const dStart = 144;
  const dProgress = interpolate(frame, [dStart, dStart + 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Bass pulse scale
  const bassScale = 1 + pulse * 0.015;

  return (
    <AbsoluteFill style={{ backgroundColor: C.void }}>
      <StarField density={100} />
      <Orbs count={20} color={C.crimson} speed={0.3} size={3} bassMultiplier={0.2} />
      <Orbs count={10} color={C.spirit} speed={0.2} size={2} />

      <div style={{ position: "absolute", top: 90, width: "100%", textAlign: "center", opacity: titleOp }}>
        <PxText text="THE GRAVEYARD OF" size={28} color={C.spirit} glow={false} bassScale={0.01} />
        <div style={{ height: 12 }} />
        <PxText text="DEAD COLLECTIONS" size={56} color={C.crimson} shake={frame < 30} bassScale={0.02} />
      </div>

      <div style={{ position: "absolute", top: 230, width: "100%", textAlign: "center", opacity: subOp }}>
        <PxText text="10,000 holders. Zero roadmap. Empty promises." size={14} color={C.spirit} glow={false} />
      </div>

      <div style={{
        position: "absolute", top: "38%", left: "50%",
        transform: `translateX(-50%) scale(${bassScale})`,
        display: "flex", gap: 28, alignItems: "center",
      }}>
        {nfts.map((nft, i) => {
          const s = spring({ frame: frame - nft.delay, fps, config: { damping: 12, stiffness: 60 } });
          return <div key={i} style={{ transform: `scale(${s}) rotate(${interpolate(s, [0, 1], [-15 + i * 5, 0])}deg)`, opacity: s }}>
            <NFTCard image={nft.img} label={nft.label} chainLabel="ETH" chainColor="#627EEA"
              size={210} dead />
          </div>;
        })}
      </div>

      {frame >= dStart - 5 && (
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", opacity: dOp }}>
          <JRPGDialogue text={dText} progress={dProgress} />
        </div>
      )}

      <ChromaticAberration amount={2} />
      <GlitchBar active={frame > 30 && frame < 55} />
      <CRT intensity={0.8} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 2: EMPOWERMENT — summoning begins (240-480f, 8s)
// ============================================================================
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pulse } = useBass();

  const circleProgress = interpolate(frame, [0, 126], [0, 1], { extrapolateRight: "clamp" });
  const titleOp = interpolate(frame, [54, 72], [0, 1], { extrapolateRight: "clamp" });
  const shakeIntensity = pulse * 0.3 + (frame > 144 ? interpolate(frame, [144, 180], [0, 0.5], { extrapolateRight: "clamp" }) : 0);

  const dText = "What if the community could bring them back?";
  const dStart = 126;
  const dProgress = interpolate(frame, [dStart, dStart + 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const sx = shakeIntensity > 0.1 ? (random(`sx2-${frame}`) - 0.5) * 12 * shakeIntensity : 0;
  const sy = shakeIntensity > 0.1 ? (random(`sy2-${frame}`) - 0.5) * 12 * shakeIntensity : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={60} />
      <Orbs count={20} color={C.gold} speed={0.5} size={3} bassMultiplier={0.3} />
      <Orbs count={20} color={C.pink} speed={0.4} size={2} bassMultiplier={0.2} />

      {/* Energy beams starting at beat 4 (frame 72) */}
      {frame >= 72 && <div style={{ opacity: interpolate(frame, [72, 108], [0, 1], { extrapolateRight: "clamp" }) }}>
        <EnergyBeams count={6} color={C.gold} intensity={0.6} />
      </div>}

      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        transform: `translate(${sx}px, ${sy}px)`,
      }}>
        <RitualCircle size={700} progress={circleProgress} glowColor={C.gold} />
      </div>

      <div style={{
        position: "absolute", top: 70, width: "100%", textAlign: "center", opacity: titleOp,
        transform: `scale(${1 + pulse * 0.01})`,
      }}>
        <PxText text="A NEW HOPE RISES" size={40} color={C.gold} bassScale={0.015} />
        <div style={{ height: 10 }} />
        <PxText text="POWERED BY THE COMMUNITY" size={14} color={C.cyan} glow={false} />
      </div>

      {frame >= dStart - 5 && (
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", opacity: dOp }}>
          <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
        </div>
      )}

      <GlitchBar active={frame >= 72 && frame < 90} />
      <ChromaticAberration amount={2} />
      <CRT intensity={0.6 + shakeIntensity * 0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 3: TRANSFORMATION — the ritual circle, DRAMATIC (480-690f, 7s)
// ============================================================================
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pulse } = useBass();

  const circleProgress = Math.min(1, frame / 90);
  const intensity = interpolate(frame, [60, 150], [0.5, 1.5], { extrapolateRight: "clamp" });

  // Screen shake tied to bass + build
  const shakeIntensity = pulse * 0.4 * Math.min(1, frame / 54) + (frame > 90 ? 0.3 : 0);
  const sx = (random(`s3x-${frame}`) - 0.5) * 14 * shakeIntensity;
  const sy = (random(`s3y-${frame}`) - 0.5) * 14 * shakeIntensity;

  const dText = "The ritual begins. Cross-chain resurrection. No bridges. No compromises.";
  const dStart = 108;
  const dProgress = interpolate(frame, [dStart, dStart + 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Flash of power at beat 4 (frame 72)
  const flashOp = frame >= 72 && frame <= 90 ? interpolate(frame, [72, 90], [0.6, 0]) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep, overflow: "hidden" }}>
      <StarField density={50} />
      <Orbs count={30} color={C.pink} speed={1.2} size={4} bassMultiplier={0.5} />
      <Orbs count={20} color={C.gold} speed={0.8} size={3} bassMultiplier={0.3} />
      <Orbs count={15} color={C.cyan} speed={0.5} size={2} bassMultiplier={0.2} />

      {/* Full-screen energy beams */}
      <EnergyBeams count={16} color={C.pink} intensity={intensity} />
      <EnergyBeams count={8} color={C.gold} intensity={intensity * 0.7} />
      <EnergyBeams count={8} color={C.cyan} intensity={intensity * 0.5} />

      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        transform: `translate(${sx}px, ${sy}px)`,
      }}>
        <RitualCircle size={860} progress={circleProgress} glowColor={C.pink} enhanced />
      </div>

      {/* Power flash */}
      {flashOp > 0 && <div style={{
        position: "absolute", inset: 0, backgroundColor: C.pink, zIndex: 150, opacity: flashOp,
      }} />}

      {frame >= dStart - 5 && (
        <div style={{
          position: "absolute", bottom: 40, left: "50%",
          transform: `translate(-50%, 0) translate(${sx * 0.3}px, ${sy * 0.3}px)`,
          opacity: dOp,
        }}>
          <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
        </div>
      )}

      <GlitchBar active={true} intensity={1.5} />
      <ChromaticAberration amount={4 + pulse * 6} />
      <CRT intensity={0.7 + shakeIntensity * 0.6} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 4: COMMUNITY POWER — The guild value prop (690-960f, 9s)
// ============================================================================
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pulse } = useBass();

  const deadOp = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" });
  const deadExit = interpolate(frame, [50, 58], [1, 0], { extrapolateRight: "clamp" });
  const resOp = interpolate(frame, [45, 58], [0, 1], { extrapolateRight: "clamp" });
  const resExit = interpolate(frame, [90, 98], [1, 0], { extrapolateRight: "clamp" });
  const flowOp = interpolate(frame, [75, 90], [0, 1], { extrapolateRight: "clamp" });

  const flowItems = [
    { label: "DEAD COLLECTION", sub: "ABANDONED BY DEVS", icon: "💀", color: C.crimson, delay: 72 },
    { label: "COMMUNITY SEALS", sub: "GUILD VOTES TO ADOPT", icon: "⚔", color: C.gold, delay: 90 },
    { label: "ROYALTIES FLOW", sub: "TO NFT HOLDERS", icon: "💰", color: C.green, delay: 108 },
  ];

  const pillsOp = interpolate(frame, [144, 162], [0, 1], { extrapolateRight: "clamp" });

  const dText = "Dead collections reborn. Royalties to holders. The community decides everything.";
  const dStart = 180;
  const dProgress = interpolate(frame, [dStart, dStart + 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={40} />
      <Orbs count={15} color={C.gold} speed={0.4} size={3} bassMultiplier={0.2} />

      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.04 }}>
        <RitualCircle size={600} progress={1} />
      </div>

      {frame < 60 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: deadOp * deadExit }}>
          <PxText text="DEAD COLLECTIONS" size={56} color={C.crimson} shake={frame < 30} bassScale={0.02} />
        </div>
      )}

      {frame >= 42 && frame < 100 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: resOp * resExit }}>
          <PxText text="RESURRECTED" size={56} color={C.green} bassScale={0.02} />
          <div style={{ height: 14 }} />
          <PxText text="BY YOU" size={28} color={C.gold} />
        </div>
      )}

      {frame >= 75 && (
        <>
          <div style={{ position: "absolute", top: 60, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: flowOp }}>
            <Img src={staticFile("art/guild-banner.png")} width={70} height={70}
              style={{ imageRendering: "pixelated", filter: `drop-shadow(0 0 ${15 + pulse * 20}px ${C.gold}44)` }} />
            <PxText text="THE GUILD" size={24} color={C.gold} bassScale={0.015} />
          </div>

          <div style={{ position: "absolute", top: "38%", left: "50%", transform: `translateX(-50%) scale(${1 + pulse * 0.01})`, display: "flex", alignItems: "center", gap: 28 }}>
            {flowItems.map((item, i) => {
              const s = spring({ frame: frame - item.delay, fps, config: { damping: 12, stiffness: 80 } });
              return <React.Fragment key={i}>
                {i > 0 && <div style={{ opacity: s, fontSize: 32, color: C.gold, textShadow: `0 0 10px ${C.gold}` }}>→</div>}
                <NESBox width={260} borderColor={`${item.color}66`} bgColor={`${item.color}08`}
                  style={{ transform: `scale(${s}) translateY(${interpolate(s, [0, 1], [30, 0])}px)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 14px", gap: 10 }}>
                  <span style={{ fontSize: 36 }}>{item.icon}</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: item.color, textAlign: "center" }}>{item.label}</span>
                  <span style={{ fontFamily: FONT, fontSize: 9, color: C.spirit, textAlign: "center" }}>{item.sub}</span>
                </NESBox>
              </React.Fragment>;
            })}
          </div>

          <div style={{ position: "absolute", bottom: 240, width: "100%", display: "flex", justifyContent: "center", gap: 20, opacity: pillsOp }}>
            {["DAO VOTING", "TREASURY", "ROYALTY SPLITS", "GOVERNANCE"].map((feat) => (
              <NESBox key={feat} width="auto" borderColor={`${C.gold}44`} bgColor={`${C.gold}08`}
                style={{ padding: "8px 20px" }}>
                <span style={{ fontFamily: FONT, fontSize: 11, color: C.gold }}>{feat}</span>
              </NESBox>
            ))}
          </div>
        </>
      )}

      {frame >= dStart - 5 && (
        <div style={{ position: "absolute", bottom: 35, left: "50%", transform: "translateX(-50%)", opacity: dOp }}>
          <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
        </div>
      )}

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 5: YOUR COLLECTION — NFTs reborn (960-1140f, 6s)
// ============================================================================
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pulse } = useBass();

  const titleOp = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" });
  const nfts = [
    { img: "nfts/bayc8817.png", label: "BAYC #8817", cc: "#627EEA", r: "LEGENDARY", rc: C.pink },
    { img: "nfts/milady4269.png", label: "Milady #4269", cc: "#627EEA", r: "EPIC", rc: C.gold },
    { img: "nfts/pudgy6529.png", label: "Pudgy #6529", cc: "#627EEA", r: "EPIC", rc: C.gold },
    { img: "nfts/madlad4200.png", label: "Mad Lad #4200", cc: "#9945FF", r: "RARE", rc: "#C0C0C0" },
  ];

  const reborn = interpolate(frame, [72, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const dText = "One gallery. Every chain. All yours.";
  const dStart = 90;
  const dProgress = interpolate(frame, [dStart, dStart + 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={40} />
      <Orbs count={15} color={C.gold} speed={0.4} size={2} bassMultiplier={0.3} />

      <div style={{ position: "absolute", top: 50, width: "100%", textAlign: "center", opacity: titleOp }}>
        <PxText text="YOUR COLLECTION" size={28} color={C.pink} bassScale={0.02} />
        <div style={{ height: 8 }} />
        {reborn > 0
          ? <PxText text="ALL REBORN ON SOLANA  ✦" size={14} color={C.green} opacity={reborn} />
          : <PxText text="From any chain..." size={12} color={C.spirit} glow={false} />
        }
      </div>

      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: `translate(-50%, -45%) scale(${1 + pulse * 0.01})`,
        display: "flex", gap: 20, alignItems: "flex-end",
      }}>
        {nfts.map((nft, i) => {
          const s = spring({ frame: frame - i * 18, fps, config: { damping: 10, stiffness: 80 } });
          return <div key={i} style={{ transform: `scale(${s}) translateY(${i === 1 || i === 2 ? -12 : 0}px)`, opacity: s }}>
            <NFTCard image={nft.img} label={nft.label}
              chainLabel={reborn > 0 ? "SOLANA" : "ETH"}
              chainColor={reborn > 0 ? "#9945FF" : nft.cc}
              size={190} rarity={nft.r} rarityColor={nft.rc}
              reborn={reborn > 0} />
          </div>;
        })}
      </div>

      {frame >= 54 && frame <= 72 && <div style={{
        position: "absolute", inset: 0, backgroundColor: C.gold, zIndex: 150,
        opacity: interpolate(frame, [54, 72], [0.5, 0]),
      }} />}

      {frame >= dStart - 5 && (
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", opacity: dOp }}>
          <JRPGDialogue text={dText} progress={dProgress} />
        </div>
      )}

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 6: FINALE (1140-1350f, 7s)
// ============================================================================
const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pulse } = useBass();

  const mascotSlam = spring({ frame: frame - 0, fps, config: { damping: 5, stiffness: 70 } });
  const mascotScale = interpolate(mascotSlam, [0, 1], [6, 1]);
  const slamFlash = frame >= 0 && frame <= 18;

  const titleOp = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [36, 54], [0, 1], { extrapolateRight: "clamp" });

  const dText = "Your NFTs deserve better. Let's begin.";
  const dStart = 54;
  const dProgress = interpolate(frame, [dStart, dStart + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dOp = interpolate(frame, [dStart - 5, dStart + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const ctaOp = interpolate(frame, [108, 126], [0, 1], { extrapolateRight: "clamp" });
  const ctaPulse = 1 + pulse * 0.04;
  const mascotGlow = 25 + pulse * 30;
  const poweredOp = interpolate(frame, [144, 162], [0, 1], { extrapolateRight: "clamp" });
  const techOp = interpolate(frame, [126, 144], [0, 1], { extrapolateRight: "clamp" });

  const sx = slamFlash ? (random(`fx6-${frame}`) - 0.5) * 14 : 0;
  const sy = slamFlash ? (random(`fy6-${frame}`) - 0.5) * 14 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.06 }}>
        <RitualCircle size={1000} progress={1} glowColor={C.pink} enhanced />
      </div>

      <StarField density={60} />
      <Orbs count={80} color={C.pink} speed={1.5} size={4} bassMultiplier={0.5} />
      <Orbs count={40} color={C.gold} speed={0.8} size={3} bassMultiplier={0.3} />
      <Orbs count={20} color={C.cyan} speed={0.6} size={2} bassMultiplier={0.2} />
      <EnergyBeams count={12} color={C.pink} intensity={0.4} />
      <EnergyBeams count={6} color={C.gold} intensity={0.25} />

      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transform: `translate(${sx}px, ${sy}px)`,
      }}>
        <div style={{
          transform: `scale(${mascotScale * mascotSlam})`, opacity: mascotSlam,
          filter: `drop-shadow(0 0 ${mascotGlow}px ${C.pink}) drop-shadow(0 0 ${mascotGlow * 1.5}px ${C.pink}44)`,
          marginBottom: 16,
        }}>
          <Img src={staticFile("art/ika-mascot-v2.png")} width={200} height={200} style={{ imageRendering: "pixelated" }} />
        </div>

        <div style={{ opacity: titleOp, transform: `scale(${1 + pulse * 0.02})` }}>
          <PxText text="イカ転生" size={72} color={C.gold} jp />
        </div>
        <div style={{ height: 6 }} />
        <div style={{ opacity: subOp }}>
          <PxText text="IKA TENSEI" size={20} color={C.pink} spacing={12} bassScale={0.02} />
        </div>

        {frame >= dStart - 5 && (
          <div style={{ marginTop: 24, opacity: dOp }}>
            <JRPGDialogue text={dText} progress={dProgress} variant="dramatic" />
          </div>
        )}

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
            <PxText text="✦  BEGIN THE RITUAL  ✦" size={16} color={C.pink} bassScale={0.03} />
          </NESBox>
        </div>

        <div style={{ marginTop: 14, opacity: poweredOp * 0.4 }}>
          <PxText text="POWERED BY IKA × DWALLET NETWORK" size={8} color={C.spirit} glow={false} />
        </div>
      </div>

      {slamFlash && <div style={{
        position: "absolute", inset: 0, backgroundColor: C.pink, zIndex: 150,
        opacity: interpolate(frame, [0, 18], [0.8, 0]),
      }} />}

      <GlitchBar active={frame >= 0 && frame <= 18} intensity={1.5} />
      <ChromaticAberration amount={3 + pulse * 4} />
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
// MAIN — beat-aligned @ 100.4 BPM, 30fps = 1342 frames (44.7s)
// Beat interval: 18 frames (~0.598s)
// Scene 1: 0-243   Scene 2: 243-477   Scene 3: 477-693
// Scene 4: 693-963  Scene 5: 963-1144  Scene 6: 1144-1342
// ============================================================================
export const PromoTrailer: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.deep }}>
    <Audio src={staticFile("music/bgm.mp3")} />

    <Sequence from={0} durationInFrames={243}><Scene1 /></Sequence>
    <Sequence from={243} durationInFrames={234}><Scene2 /></Sequence>
    <Sequence from={477} durationInFrames={216}><Scene3 /></Sequence>
    <Sequence from={693} durationInFrames={270}><Scene4 /></Sequence>
    <Sequence from={963} durationInFrames={181}><Scene5 /></Sequence>
    <Sequence from={1144} durationInFrames={198}><Scene6 /></Sequence>

    <FlashCut at={243} color={C.pink} />
    <FlashCut at={477} color={C.gold} />
    <FlashCut at={693} color={C.cyan} duration={6} />
    <FlashCut at={963} color={C.gold} duration={6} />
    <FlashCut at={1144} color={C.pink} />
  </AbsoluteFill>
);
