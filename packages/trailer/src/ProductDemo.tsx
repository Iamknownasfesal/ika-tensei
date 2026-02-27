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
  cardBg: "#1a1428",
  border: "#3d2f5c",
  crimson: "#dc143c",
  eth: "#627EEA",
  sol: "#9945FF",
};

const FONT = "'Press Start 2P', 'Courier New', monospace";

// ============================================================================
// SHARED COMPONENTS (preserved)
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
  const flicker = 0.93 + Math.sin(frame * 0.4) * 0.07;
  return <>
    <div style={{
      position: "absolute", inset: 0, zIndex: 190, pointerEvents: "none",
      background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,${0.08 * intensity * flicker}) 2px, rgba(0,0,0,${0.08 * intensity * flicker}) 4px)`,
    }} />
    <div style={{
      position: "absolute", inset: 0, zIndex: 191, pointerEvents: "none",
      background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${0.6 * intensity}) 100%)`,
    }} />
  </>;
};

const StarField: React.FC<{ density?: number }> = ({ density = 50 }) => {
  const frame = useCurrentFrame();
  const stars = useMemo(() => Array.from({ length: density }, (_, i) => ({
    x: random(`dsx-${i}`) * 100, y: random(`dsy-${i}`) * 100,
    s: 1 + random(`dss-${i}`) * 1.5, phase: random(`dsp-${i}`) * Math.PI * 2,
    tw: 0.02 + random(`dst-${i}`) * 0.03,
  })), [density]);
  return <>{stars.map((s, i) => (
    <div key={i} style={{
      position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
      width: s.s, height: s.s, borderRadius: "50%", backgroundColor: C.white,
      opacity: 0.1 + Math.sin(frame * s.tw + s.phase) * 0.1,
    }} />
  ))}</>;
};

const Orbs: React.FC<{ count: number; color: string; speed?: number; size?: number }> = ({ count, color, speed = 1, size = 3 }) => {
  const frame = useCurrentFrame();
  const orbs = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: random(`dox-${i}`) * 100, y: random(`doy-${i}`) * 100,
    s: size * (0.5 + random(`dos-${i}`)), phase: random(`dop-${i}`) * Math.PI * 2,
    spd: (0.5 + random(`dosp-${i}`) * 1.5) * speed,
  })), [count, size, speed]);
  return <>{orbs.map((o, i) => {
    const x = o.x + Math.sin(frame * 0.015 * o.spd + o.phase) * 6;
    const y = (o.y - frame * 0.25 * o.spd + 120) % 120 - 10;
    return <div key={i} style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      width: o.s, height: o.s, borderRadius: "50%",
      backgroundColor: color, opacity: 0.2 + Math.sin(frame * 0.04 + o.phase) * 0.2,
      boxShadow: `0 0 ${o.s * 3}px ${color}`,
    }} />;
  })}</>;
};

const NESBox: React.FC<{
  children: React.ReactNode; width?: number | string; height?: number | string;
  borderColor?: string; bgColor?: string; style?: React.CSSProperties; glow?: string;
}> = ({ children, width, height, borderColor = C.border, bgColor = `${C.cardBg}f0`, style, glow }) => (
  <div style={{
    width, height, position: "relative", backgroundColor: bgColor,
    border: `4px solid ${borderColor}`,
    boxShadow: `inset -4px -4px 0 0 ${borderColor}88, inset 4px 4px 0 0 ${borderColor}44, 6px 6px 0 0 rgba(0,0,0,0.4)${glow ? `, 0 0 30px ${glow}, 0 0 60px ${glow}44` : ""}`,
    ...style,
  }}>{children}</div>
);

const PxText: React.FC<{
  text: string; size: number; color: string;
  glow?: boolean; jp?: boolean; opacity?: number; spacing?: number;
}> = ({ text, size, color, glow = true, jp = false, opacity = 1, spacing }) => (
  <div style={{
    fontFamily: jp ? "'Noto Sans JP', sans-serif" : FONT, fontSize: size,
    fontWeight: jp ? 900 : undefined, color, opacity,
    textShadow: glow ? `0 0 ${size * 0.5}px ${color}, 0 0 ${size}px ${color}44` : "none",
    textAlign: "center", lineHeight: 1.4,
    letterSpacing: spacing ?? (jp ? 8 : 2),
  }}>{text}</div>
);

const RitualCircle: React.FC<{ size: number; progress: number; glowColor?: string }> = ({ size, progress, glowColor = C.gold }) => {
  const frame = useCurrentFrame();
  const p = Math.sin(frame * 0.06) * 0.15;
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛏᛒᛖᛗᛚᛝᛞᛟ";
  return <div style={{ width: size, height: size, position: "relative" }}>
    <svg viewBox="0 0 200 200" width={size} height={size}
      style={{ filter: `drop-shadow(0 0 ${15 + p * 20}px ${glowColor}88)` }}>
      <circle cx="100" cy="100" r="96" fill="none" stroke={glowColor}
        strokeWidth="2" opacity={0.7 + p}
        strokeDasharray={`${progress * 603} 603`}
        transform={`rotate(${frame * 0.4}, 100, 100)`} />
      <circle cx="100" cy="100" r="72" fill="none" stroke={C.pink}
        strokeWidth="1.2" opacity={0.5 + p} strokeDasharray={`${progress * 452} 452`}
        transform={`rotate(${-frame * 0.3}, 100, 100)`} />
      <circle cx="100" cy="100" r="50" fill="none" stroke={glowColor}
        strokeWidth="0.8" opacity={0.4 + p}
        strokeDasharray={`${progress * 314} 314`}
        transform={`rotate(${frame * 0.5}, 100, 100)`} />
      <polygon points="100,15 165,143 35,143" fill="none" stroke={glowColor}
        strokeWidth="1.5" opacity={(0.6 + p) * Math.min(1, progress * 2)}
        transform={`rotate(${frame * 0.2}, 100, 100)`} />
      <polygon points="100,185 35,57 165,57" fill="none" stroke={glowColor}
        strokeWidth="1.5" opacity={(0.6 + p) * Math.min(1, progress * 2)}
        transform={`rotate(${-frame * 0.2}, 100, 100)`} />
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i / 16) * Math.PI * 2 + frame * 0.01;
        return <text key={i}
          x={100 + 85 * Math.cos(a)} y={100 + 85 * Math.sin(a)}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="7" fill={glowColor} opacity={progress * 16 > i ? 0.6 + p : 0}
          style={{ fontFamily: "serif" }}>{runes[i % runes.length]}</text>;
      })}
      <circle cx="100" cy="100" r={8 + p * 10} fill={C.pink} opacity={0.6 + p} />
      <circle cx="100" cy="100" r={4 + p * 5} fill={C.gold} opacity={0.9} />
    </svg>
  </div>;
};

// ============================================================================
// IMPROVED NFT CARD — bigger labels
// ============================================================================
const DemoNFTCard: React.FC<{
  image: string; label: string; chain: string; chainColor: string;
  size?: number; reborn?: boolean; sealed?: boolean; checked?: boolean; greyed?: boolean;
}> = ({ image, label, chain, chainColor, size = 220, reborn = false, sealed = false, checked = false, greyed = false }) => {
  const frame = useCurrentFrame();
  const glow = reborn ? 16 + Math.sin(frame * 0.1) * 10 : sealed ? 10 + Math.sin(frame * 0.08) * 6 : 0;
  const borderColor = reborn ? C.gold : sealed ? C.pink : checked ? C.green : chainColor;
  const imgHeight = size - 72;
  return (
    <div style={{ position: "relative" }}>
      <NESBox width={size} borderColor={`${borderColor}88`}
        glow={reborn ? `${C.gold}55` : sealed ? `${C.pink}44` : checked ? `${C.green}44` : undefined}
        style={{ overflow: "hidden" }}>
        <div style={{ width: size - 8, height: imgHeight, overflow: "hidden", backgroundColor: C.deep }}>
          <Img src={staticFile(image)} style={{
            width: "100%", height: "100%", objectFit: "cover",
            filter: [
              greyed ? "grayscale(100%) brightness(0.5)" : "",
              reborn ? `drop-shadow(0 0 ${glow}px ${C.gold}) saturate(1.4)` : "",
              sealed ? `drop-shadow(0 0 ${glow}px ${C.pink}) saturate(0.7)` : "",
            ].filter(Boolean).join(" ") || undefined,
          }} />
        </div>
        <div style={{ padding: "10px 12px", backgroundColor: `${C.void}ee` }}>
          <div style={{ fontFamily: FONT, fontSize: 14, color: reborn ? C.gold : sealed ? C.pink : checked ? C.green : C.white, textAlign: "center", marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: chainColor }} />
            <span style={{ fontFamily: FONT, fontSize: 12, color: chainColor }}>{chain}</span>
          </div>
          {reborn && (
            <div style={{ textAlign: "center", marginTop: 6 }}>
              <span style={{ fontFamily: FONT, fontSize: 11, color: C.gold, backgroundColor: `${C.gold}22`, padding: "3px 8px", border: `1px solid ${C.gold}44` }}>
                ✦ REBORN
              </span>
            </div>
          )}
        </div>
      </NESBox>
      {checked && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          width: 28, height: 28, backgroundColor: C.green,
          border: `2px solid ${C.green}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 12px ${C.green}88`,
        }}>
          <span style={{ fontFamily: FONT, fontSize: 14, color: C.deep }}>✓</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP PROGRESS BAR — used in scenes 2-6
// ============================================================================
const GUILD_COLOR = "#c084fc";

const StepProgressBar: React.FC<{ activeStep: number }> = ({ activeStep }) => {
  const frame = useCurrentFrame();
  const steps = [
    { num: 1, label: "CONNECT", color: C.cyan },
    { num: 2, label: "SEAL", color: C.pink },
    { num: 3, label: "REBORN", color: C.gold },
    { num: 4, label: "GALLERY", color: C.green },
    { num: 5, label: "GUILD", color: GUILD_COLOR },
  ];
  const barOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      height: 86, backgroundColor: `${C.deep}f5`,
      borderBottom: `3px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 14, zIndex: 100, opacity: barOp,
    }}>
      {steps.map((step, i) => {
        const isActive = step.num === activeStep;
        const isDone = step.num < activeStep;
        const color = isActive ? step.color : isDone ? `${step.color}99` : C.spirit;
        return (
          <React.Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 42, height: 42,
                border: `3px solid ${isActive ? step.color : isDone ? `${step.color}77` : C.border}`,
                backgroundColor: isActive ? `${step.color}22` : isDone ? `${step.color}0a` : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isActive ? `0 0 18px ${step.color}55` : "none",
              }}>
                <span style={{ fontFamily: FONT, fontSize: isDone ? 14 : 18, color: isActive ? step.color : isDone ? `${step.color}bb` : C.spirit }}>
                  {isDone ? "✓" : `${step.num}`}
                </span>
              </div>
              <span style={{
                fontFamily: FONT, fontSize: isActive ? 16 : 13, color, letterSpacing: 1,
                textShadow: isActive ? `0 0 10px ${step.color}77` : "none",
              }}>
                {step.label}
              </span>
            </div>
            {i < 4 && (
              <div style={{
                width: 60, height: 3,
                backgroundColor: isDone ? `${steps[i].color}77` : `${C.border}44`,
                boxShadow: isDone ? `0 0 8px ${steps[i].color}44` : "none",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ============================================================================
// SCENE 1: INTRO (frames 0-297, ~10s)
// Left: mascot | Right: title + bullets + step boxes
// ============================================================================
const DemoScene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bgOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const mascotS = spring({ frame: frame - 8, fps, config: { damping: 8, stiffness: 55 } });
  const jpOp = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });
  const titleOp = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [55, 72], [0, 1], { extrapolateRight: "clamp" });
  const glowPulse = 28 + Math.sin(frame * 0.06) * 14;

  // Bullet points — type in on beats (beat 5=90, 6=108, 7=126)
  const bullets = [
    "✦ Bridge NFTs from any dead collection",
    "✦ Mint reborn versions on Solana",
    "✦ Community-governed resurrection",
  ];
  const bulletRevealFrames = [90, 108, 126];

  // 5 step boxes spring in starting beat 8 (frame 144)
  const stepColors = [C.cyan, C.pink, C.gold, C.green, GUILD_COLOR];
  const stepLabels = ["CONNECT", "SEAL", "REBORN", "GALLERY", "GUILD"];

  const stepsBarOp = interpolate(frame, [150, 168], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.void, opacity: bgOp }}>
      <StarField density={90} />
      <Orbs count={25} color={C.pink} speed={0.5} size={3} />
      <Orbs count={18} color={C.gold} speed={0.35} size={2} />

      {/* Background ritual circle faint */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.06 }}>
        <RitualCircle size={1000} progress={1} glowColor={C.gold} />
      </div>

      {/* LEFT HALF: Mascot */}
      <div style={{
        position: "absolute", left: 0, top: 0, width: 840, bottom: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          transform: `scale(${mascotS})`, opacity: mascotS,
          filter: `drop-shadow(0 0 ${glowPulse}px ${C.pink}) drop-shadow(0 0 ${glowPulse * 0.7}px ${C.gold}55)`,
        }}>
          <Img src={staticFile("art/ika-mascot-v2.png")} width={280} height={280}
            style={{ imageRendering: "pixelated" }} />
        </div>
      </div>

      {/* Vertical divider */}
      <div style={{
        position: "absolute", left: 880, top: 80, bottom: 80,
        width: 2, backgroundColor: `${C.pink}33`,
        boxShadow: `0 0 20px ${C.pink}22`,
      }} />

      {/* RIGHT HALF: Title + content */}
      <div style={{
        position: "absolute", left: 940, top: 0, right: 80, bottom: 0,
        display: "flex", flexDirection: "column", justifyContent: "center",
        gap: 0,
      }}>
        {/* JP Characters */}
        <div style={{ opacity: jpOp, marginBottom: 8 }}>
          <PxText text="イカ転生" size={28} color={C.pink} jp />
        </div>

        {/* Main Title */}
        <div style={{ opacity: titleOp, marginBottom: 18 }}>
          <div style={{
            fontFamily: FONT, fontSize: 64, color: C.gold, letterSpacing: 4,
            textShadow: `0 0 32px ${C.gold}, 0 0 64px ${C.gold}44`,
            lineHeight: 1.2,
          }}>IKA TENSEI</div>
        </div>

        {/* Subtitle */}
        <div style={{ opacity: subOp, marginBottom: 36 }}>
          <div style={{ fontFamily: FONT, fontSize: 24, color: C.white, letterSpacing: 2, lineHeight: 1.5 }}>
            Resurrect Dead NFT Collections
          </div>
        </div>

        {/* Bullet points */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 44 }}>
          {bullets.map((bullet, i) => {
            const op = interpolate(frame, [bulletRevealFrames[i], bulletRevealFrames[i] + 14], [0, 1], { extrapolateRight: "clamp" });
            const slide = interpolate(frame, [bulletRevealFrames[i], bulletRevealFrames[i] + 18], [-30, 0], { extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ opacity: op, transform: `translateX(${slide}px)` }}>
                <div style={{
                  fontFamily: FONT, fontSize: 18, color: C.white, letterSpacing: 1,
                  textShadow: `0 0 10px ${C.white}33`,
                }}>{bullet}</div>
              </div>
            );
          })}
        </div>

        {/* "4 SIMPLE STEPS" + step boxes */}
        <div style={{ opacity: stepsBarOp }}>
          <div style={{ fontFamily: FONT, fontSize: 18, color: C.spirit, letterSpacing: 3, marginBottom: 20 }}>
            5 SIMPLE STEPS
          </div>

          {/* Step boxes row */}
          <div style={{ display: "flex", gap: 12 }}>
            {stepLabels.map((label, i) => {
              const s = spring({ frame: frame - 144 - i * 12, fps, config: { damping: 12, stiffness: 100 } });
              return (
                <div key={i} style={{ transform: `scale(${s}) translateY(${interpolate(s, [0, 1], [20, 0])}px)`, opacity: s }}>
                  <NESBox width={132} borderColor={`${stepColors[i]}77`} bgColor={`${stepColors[i]}10`}
                    style={{ padding: "14px 10px", textAlign: "center" }}>
                    <div style={{ fontFamily: FONT, fontSize: 28, color: stepColors[i], marginBottom: 10,
                      textShadow: `0 0 16px ${stepColors[i]}` }}>
                      {i + 1}
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: stepColors[i], letterSpacing: 1 }}>{label}</div>
                  </NESBox>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 2: CONNECT WALLET (frames 297-657, ~12s)
// Top: step bar | Left 55%: wallet + collection select | Right 45%: dead collections list
// Bottom row: 4 NFT thumbnails + proceed button
// ============================================================================
const DemoScene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Wallet connects at beat 5 (frame 90)
  const walletConnected = frame >= 90;
  const walletOp = interpolate(frame, [12, 30], [0, 1], { extrapolateRight: "clamp" });
  const collectionOp = interpolate(frame, [54, 72], [0, 1], { extrapolateRight: "clamp" });
  const collectionPanelOp = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });

  // Collection rows appear one by one (beats 3,4,5)
  const collectionReveal = [54, 72, 90];

  // NFT grid appears at beat 7 (frame 126)
  const nftGridOp = interpolate(frame, [126, 144], [0, 1], { extrapolateRight: "clamp" });

  // Checkmarks tick on beats 9-12 (162, 180, 198, 216)
  const checkTimes = [162, 180, 198, 216];

  // Proceed button at beat 13 (frame 234)
  const proceedOp = interpolate(frame, [234, 252], [0, 1], { extrapolateRight: "clamp" });

  const nfts = [
    { img: "nfts/bayc8817.png", label: "BAYC #8817" },
    { img: "nfts/azuki9605.png", label: "AZUKI #9605" },
    { img: "nfts/pudgy6529.png", label: "PUDGY #6529" },
    { img: "nfts/madlad4200.png", label: "MAD LAD #4200" },
  ];

  const collections = [
    { icon: "💀", name: "Bored Ape YC", floor: "$0", status: "ABANDONED", selected: true },
    { icon: "💀", name: "Milady Maker", floor: "$2", status: "RUGPULL", selected: false },
    { icon: "💀", name: "Mad Lads", floor: "$0", status: "DEAD", selected: false },
  ];

  const cursor = Math.sin(frame * 0.25) > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={40} />
      <Orbs count={12} color={C.cyan} speed={0.4} size={2} />

      <StepProgressBar activeStep={1} />

      {/* LEFT PANEL: wallet + collection selector (55% width) */}
      <div style={{
        position: "absolute", left: 80, top: 106, bottom: 30, width: 980,
        display: "flex", flexDirection: "column", gap: 22,
        paddingTop: 20,
      }}>
        {/* Wallet UI */}
        <div style={{ opacity: walletOp }}>
          <NESBox width={940} borderColor={walletConnected ? C.green : C.border}
            glow={walletConnected ? `${C.green}44` : undefined}
            style={{ padding: "24px 30px" }}>
            <div style={{ fontFamily: FONT, fontSize: 28, color: walletConnected ? C.green : C.spirit, marginBottom: 18,
              textShadow: walletConnected ? `0 0 16px ${C.green}77` : "none" }}>
              {walletConnected ? "✓ WALLET CONNECTED" : "CONNECT YOUR WALLET"}
            </div>

            {walletConnected ? (
              <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, marginBottom: 8 }}>ADDRESS</div>
                  <div style={{ fontFamily: "'Courier New', monospace", fontSize: 20, color: C.cyan, letterSpacing: 2 }}>
                    7xKp...4f2e{cursor ? "█" : " "}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, marginBottom: 8 }}>BALANCE</div>
                  <div style={{ fontFamily: FONT, fontSize: 20, color: C.gold }}>12.5 SOL</div>
                </div>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, marginBottom: 8 }}>NETWORK</div>
                  <div style={{ fontFamily: FONT, fontSize: 20, color: "#9945FF" }}>SOLANA</div>
                </div>
              </div>
            ) : (
              <div style={{
                fontFamily: FONT, fontSize: 20, color: C.void,
                backgroundColor: C.cyan, padding: "14px 28px",
                boxShadow: `0 0 20px ${C.cyan}55`, display: "inline-block",
                letterSpacing: 2,
              }}>
                Connect Phantom ⟩
              </div>
            )}
          </NESBox>
        </div>

        {/* Collection selector */}
        {frame >= 54 && (
          <div style={{ opacity: collectionOp }}>
            <NESBox width={940} borderColor={`${C.pink}66`} glow={`${C.pink}22`}
              style={{ padding: "22px 30px" }}>
              <div style={{ fontFamily: FONT, fontSize: 22, color: C.pink, marginBottom: 18, letterSpacing: 2 }}>
                SELECT DEAD COLLECTION
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <div style={{ fontFamily: FONT, fontSize: 20, color: C.crimson }}>💀 Bored Ape Yacht Club</div>
                <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit }}>10,000 NFTS  |  ABANDONED</div>
                <div style={{
                  fontFamily: FONT, fontSize: 14, color: C.green,
                  backgroundColor: `${C.green}22`, padding: "6px 14px",
                  border: `2px solid ${C.green}55`,
                }}>✓ SELECTED</div>
              </div>
            </NESBox>
          </div>
        )}

        {/* NFT selection row */}
        {frame >= 126 && (
          <div style={{ opacity: nftGridOp }}>
            <div style={{ fontFamily: FONT, fontSize: 18, color: C.cyan, letterSpacing: 2, marginBottom: 14,
              textShadow: `0 0 10px ${C.cyan}66` }}>
              SELECT NFTs TO RESURRECT
            </div>
            <div style={{ display: "flex", gap: 18 }}>
              {nfts.map((nft, i) => {
                const s = spring({ frame: frame - (126 + i * 14), fps, config: { damping: 12, stiffness: 90 } });
                const isChecked = frame >= checkTimes[i];
                return (
                  <div key={i} style={{ transform: `scale(${s})`, opacity: s }}>
                    <DemoNFTCard image={nft.img} label={nft.label} chain="ETH"
                      chainColor={C.eth} size={200} checked={isChecked} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Proceed button */}
        {frame >= 234 && (
          <div style={{ opacity: proceedOp }}>
            <NESBox width={560} borderColor={C.pink} bgColor={`${C.pink}22`}
              glow={`${C.pink}66`} style={{ padding: "18px 0", textAlign: "center" }}>
              <PxText text="PROCEED TO SEAL  →" size={22} color={C.pink} />
            </NESBox>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Dead collection list (45% width) */}
      <div style={{
        position: "absolute", right: 80, top: 106, width: 760,
        paddingTop: 20, opacity: collectionPanelOp,
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 22, color: C.spirit, letterSpacing: 2, marginBottom: 6 }}>
          DEAD COLLECTION REGISTRY
        </div>
        {collections.map((col, i) => {
          const op = interpolate(frame, [collectionReveal[i], collectionReveal[i] + 18], [0, 1], { extrapolateRight: "clamp" });
          const slideX = interpolate(frame, [collectionReveal[i], collectionReveal[i] + 24], [40, 0], { extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ opacity: op, transform: `translateX(${slideX}px)` }}>
              <NESBox width={720}
                borderColor={col.selected ? `${C.gold}99` : `${C.border}88`}
                bgColor={col.selected ? `${C.gold}0e` : `${C.cardBg}cc`}
                glow={col.selected ? `${C.gold}33` : undefined}
                style={{ padding: "18px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ fontSize: 24 }}>{col.icon}</span>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 18, color: col.selected ? C.gold : C.white, marginBottom: 8 }}>
                        {col.name}
                      </div>
                      <div style={{ display: "flex", gap: 20 }}>
                        <span style={{ fontFamily: FONT, fontSize: 14, color: C.spirit }}>Floor:</span>
                        <span style={{ fontFamily: FONT, fontSize: 14, color: C.white }}>{col.floor}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontFamily: FONT, fontSize: 14,
                    color: col.selected ? C.gold : C.crimson,
                    backgroundColor: col.selected ? `${C.gold}22` : `${C.crimson}22`,
                    border: `2px solid ${col.selected ? C.gold : C.crimson}55`,
                    padding: "8px 14px",
                  }}>
                    {col.selected ? "✓ " : ""}{col.status}
                  </div>
                </div>
              </NESBox>
            </div>
          );
        })}

        {/* Info box */}
        {frame >= 144 && (
          <div style={{ opacity: interpolate(frame, [144, 162], [0, 1], { extrapolateRight: "clamp" }), marginTop: 10 }}>
            <NESBox width={720} borderColor={`${C.cyan}44`} bgColor={`${C.cyan}08`}
              style={{ padding: "18px 22px" }}>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.cyan, marginBottom: 12 }}>
                WHY RESURRECT?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  "Preserve your NFT's history & provenance",
                  "Join an active community on Solana",
                  "Earn royalties on secondary sales",
                ].map((line, i) => (
                  <div key={i} style={{ fontFamily: FONT, fontSize: 14, color: C.white }}>
                    ▸ {line}
                  </div>
                ))}
              </div>
            </NESBox>
          </div>
        )}
      </div>

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 3: SEAL (frames 657-1017, ~12s)
// Left: sealing process + progress | Center: NFT + ritual | Right: transaction details
// ============================================================================
const DemoScene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nftOp = interpolate(frame, [12, 30], [0, 1], { extrapolateRight: "clamp" });
  const circleProgress = interpolate(frame, [36, 252], [0, 1], { extrapolateRight: "clamp" });
  const progressPct = Math.round(circleProgress * 100);
  const glowPulse = Math.sin(frame * 0.08) * 0.5 + 0.5;

  // Status messages tick on beats: 54, 108, 162, 216
  const statusBeats = [54, 108, 162, 216];
  const statusMessages = [
    "Reading NFT metadata from Ethereum...",
    "Generating cryptographic proof...",
    "Cross-chain verification via IKA Network...",
    "Preparing Solana mint transaction...",
  ];

  const leftPanelOp = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });
  const rightPanelOp = interpolate(frame, [24, 42], [0, 1], { extrapolateRight: "clamp" });

  // Flash at completion
  const completionFlash = frame >= 252 && frame < 270
    ? interpolate(frame, [252, 270], [0.7, 0]) : 0;

  const sealShake = frame >= 238 && frame < 256;
  const sx = sealShake ? (random(`ss3-${frame}`) - 0.5) * 8 : 0;
  const sy = sealShake ? (random(`sy3-${frame}`) - 0.5) * 8 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={50} />
      <Orbs count={20} color={C.pink} speed={0.6} size={3} />
      <Orbs count={12} color={C.gold} speed={0.3} size={2} />

      <StepProgressBar activeStep={2} />

      {/* LEFT PANEL: Sealing process (x:80, w:540) */}
      <div style={{
        position: "absolute", left: 80, top: 106, width: 560,
        paddingTop: 24, opacity: leftPanelOp,
      }}>
        <NESBox width={540} borderColor={`${C.pink}66`} bgColor={`${C.cardBg}cc`}
          style={{ padding: "24px 28px" }}>
          <div style={{ fontFamily: FONT, fontSize: 22, color: C.pink, marginBottom: 24, letterSpacing: 2 }}>
            SEALING PROCESS
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontFamily: FONT, fontSize: 16, color: C.spirit }}>PROGRESS</span>
              <span style={{ fontFamily: FONT, fontSize: 20, color: C.gold }}>{progressPct}%</span>
            </div>
            <div style={{
              width: "100%", height: 20,
              backgroundColor: `${C.border}66`,
              border: `3px solid ${C.pink}44`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%",
                width: `${circleProgress * 100}%`,
                backgroundColor: C.pink,
                boxShadow: `0 0 16px ${C.pink}, 0 0 32px ${C.pink}55`,
              }} />
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} style={{
                  position: "absolute", left: `${i * 5}%`, top: 0, bottom: 0,
                  width: 2, backgroundColor: `${C.deep}66`,
                }} />
              ))}
            </div>
          </div>

          {/* Status messages */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {statusMessages.map((msg, i) => {
              const done = frame >= statusBeats[i];
              const op = interpolate(frame, [statusBeats[i] - 10, statusBeats[i] + 10], [0, 1], { extrapolateRight: "clamp" });
              return (
                <div key={i} style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  opacity: done ? 1 : frame >= statusBeats[i] - 20 ? op : 0.25,
                }}>
                  <span style={{
                    fontFamily: FONT, fontSize: 18,
                    color: done ? C.green : C.spirit,
                    textShadow: done ? `0 0 10px ${C.green}` : "none",
                    flexShrink: 0,
                  }}>
                    {done ? "✓" : "○"}
                  </span>
                  <span style={{
                    fontFamily: FONT, fontSize: 14, color: done ? C.white : C.spirit,
                    lineHeight: 1.6,
                  }}>{msg}</span>
                </div>
              );
            })}
          </div>
        </NESBox>
      </div>

      {/* CENTER: Large NFT + ritual circle */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: `translate(-50%, -48%) translate(${sx}px, ${sy}px)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {/* Ritual circle */}
        <div style={{
          position: "absolute",
          opacity: 0.3 + circleProgress * 0.7,
          filter: `drop-shadow(0 0 ${25 + glowPulse * 25}px ${C.pink}66)`,
        }}>
          <RitualCircle size={560} progress={circleProgress} glowColor={C.pink} />
        </div>

        {/* NFT card */}
        <div style={{ position: "relative", zIndex: 10, opacity: nftOp }}>
          <DemoNFTCard
            image="nfts/bayc8817.png"
            label="BAYC #8817"
            chain={circleProgress > 0.6 ? "SEALED" : "ETH"}
            chainColor={circleProgress > 0.6 ? C.pink : C.eth}
            size={260}
            sealed={circleProgress > 0.6}
          />
        </div>
      </div>

      {/* RIGHT PANEL: Transaction details (right: 80, w:540) */}
      <div style={{
        position: "absolute", right: 80, top: 106, width: 560,
        paddingTop: 24, opacity: rightPanelOp,
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        <NESBox width={540} borderColor={`${C.gold}66`} bgColor={`${C.cardBg}cc`}
          style={{ padding: "24px 28px" }}>
          <div style={{ fontFamily: FONT, fontSize: 22, color: C.gold, marginBottom: 24, letterSpacing: 2 }}>
            TRANSACTION DETAILS
          </div>
          {[
            { label: "Source Chain", value: "Ethereum", color: C.eth },
            { label: "Target Chain", value: "Solana", color: C.sol },
            { label: "Gas Fee", value: "0.002 SOL ($0.30)", color: C.green },
            { label: "Est. Time", value: "~12 seconds", color: C.cyan },
            { label: "Proof Method", value: "Ed25519 + dWallet MPC", color: C.gold },
            { label: "Security", value: "Non-Custodial", color: C.white },
          ].map((row, i) => {
            const rowOp = interpolate(frame, [24 + i * 10, 40 + i * 10], [0, 1], { extrapolateRight: "clamp" });
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                borderBottom: `2px solid ${C.border}44`, paddingBottom: 14, marginBottom: 14,
                opacity: rowOp,
              }}>
                <span style={{ fontFamily: FONT, fontSize: 14, color: C.spirit }}>{row.label}</span>
                <span style={{ fontFamily: FONT, fontSize: 14, color: row.color }}>{row.value}</span>
              </div>
            );
          })}
        </NESBox>

        {/* IKA Network badge */}
        {frame >= 90 && (
          <div style={{ opacity: interpolate(frame, [90, 108], [0, 1], { extrapolateRight: "clamp" }) }}>
            <NESBox width={540} borderColor={`${C.cyan}55`} bgColor={`${C.cyan}08`}
              style={{ padding: "18px 22px", textAlign: "center" }}>
              <div style={{ fontFamily: FONT, fontSize: 16, color: C.cyan, marginBottom: 12 }}>
                ⚡ POWERED BY IKA NETWORK
              </div>
              <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, lineHeight: 1.8 }}>
                Trustless cross-chain proofs<br />
                via dWallet MPC technology
              </div>
            </NESBox>
          </div>
        )}

        {/* Rune decorations */}
        {frame >= 72 && (
          <div style={{ opacity: interpolate(frame, [72, 90], [0, 1], { extrapolateRight: "clamp" }) }}>
            {[
              { text: "ᚠᚢᚦᚨᚱ", color: C.gold },
              { text: "ᚲᚷᚹᚺᚾᛁ", color: C.pink },
              { text: "ᛃᛇᛈᛉᛏᛒ", color: C.cyan },
            ].map((r, i) => (
              <div key={i} style={{
                fontFamily: "serif", fontSize: 22, color: r.color,
                opacity: 0.35 + glowPulse * 0.2,
                textShadow: `0 0 8px ${r.color}`,
                letterSpacing: 6, textAlign: "center",
                display: "inline-block", marginRight: 12,
              }}>{r.text}</div>
            ))}
          </div>
        )}
      </div>

      {/* Completion flash */}
      {completionFlash > 0 && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: C.gold, zIndex: 300, opacity: completionFlash }} />
      )}

      <CRT intensity={0.6} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 4: REBORN (frames 1017-1378, ~12s)
// Before/After split | Metadata comparison table | Share buttons
// ============================================================================
const DemoScene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Flash on entry
  const flashOp = frame < 22 ? interpolate(frame, [0, 22], [1, 0]) : 0;

  const glowPulse = Math.sin(frame * 0.07) * 0.5 + 0.5;
  const rebornGlow = 24 + Math.sin(frame * 0.08) * 16;

  const beforeS = spring({ frame: frame - 12, fps, config: { damping: 10, stiffness: 70 } });
  const afterS = spring({ frame: frame - 24, fps, config: { damping: 7, stiffness: 55 } });
  const arrowOp = interpolate(frame, [30, 48], [0, 1], { extrapolateRight: "clamp" });

  const tableOp = interpolate(frame, [90, 108], [0, 1], { extrapolateRight: "clamp" });
  const shareOp = interpolate(frame, [198, 216], [0, 1], { extrapolateRight: "clamp" });

  const tableRows = [
    { label: "Chain", before: "Ethereum", after: "Solana", afterColor: C.sol },
    { label: "Status", before: "Dead", after: "Reborn ✦", afterColor: C.gold },
    { label: "Royalties", before: "None", after: "5% to holders", afterColor: C.green },
    { label: "Community", before: "Abandoned", after: "Guild Protected", afterColor: C.cyan },
    { label: "Provenance", before: "—", after: "✓ Verified on-chain", afterColor: C.green },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={65} />
      <Orbs count={35} color={C.gold} speed={0.8} size={3} />
      <Orbs count={18} color={C.green} speed={0.5} size={2} />

      {/* Gold flash on entry */}
      {flashOp > 0 && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: C.gold, zIndex: 300, opacity: flashOp * 0.85 }} />
      )}

      <StepProgressBar activeStep={3} />

      {/* Main content: vertically centered unified flow */}
      <div style={{
        position: "absolute", top: 96, left: 80, right: 80, bottom: 20,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 24,
      }}>
        {/* BEFORE/AFTER cards row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 40 }}>
          {/* BEFORE */}
          <div style={{ transform: `scale(${beforeS})`, opacity: beforeS }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: FONT, fontSize: 22, color: C.crimson, letterSpacing: 3 }}>BEFORE</div>
            </div>
            <div style={{ filter: "drop-shadow(0 0 10px rgba(220,20,60,0.3))" }}>
              <DemoNFTCard image="nfts/bayc8817.png" label="BAYC #8817"
                chain="ETHEREUM" chainColor={C.eth} size={230} greyed />
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              {["💀 DEAD", "No royalties", "No community"].map((t, i) => (
                <div key={i} style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, marginBottom: 6 }}>{t}</div>
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div style={{ opacity: arrowOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 100 }}>
            <div style={{ fontFamily: FONT, fontSize: 48, color: C.gold, textShadow: `0 0 24px ${C.gold}` }}>→</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: C.gold, letterSpacing: 2 }}>RESURRECTION</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.spirit, letterSpacing: 1, textAlign: "center", lineHeight: 1.8 }}>
              IKA NETWORK<br />dWallet MPC
            </div>
          </div>

          {/* AFTER */}
          <div style={{ transform: `scale(${afterS})`, opacity: afterS }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: FONT, fontSize: 22, color: C.gold, letterSpacing: 3, textShadow: `0 0 16px ${C.gold}` }}>AFTER</div>
            </div>
            <div style={{ filter: `drop-shadow(0 0 ${rebornGlow}px ${C.gold}) drop-shadow(0 0 ${rebornGlow * 0.5}px ${C.gold}66)` }}>
              <DemoNFTCard image="nfts/bayc8817.png" label="BAYC #8817"
                chain="SOLANA" chainColor={C.sol} size={230} reborn />
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              {["✨ REBORN", "Royalties active", "Guild member"].map((t, i) => (
                <div key={i} style={{ fontFamily: FONT, fontSize: 14, color: i === 0 ? C.gold : C.green, marginBottom: 6 }}>{t}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Metadata comparison table */}
        <div style={{ opacity: tableOp, width: 1600 }}>
          <NESBox width={1600} borderColor={`${C.gold}55`} bgColor={`${C.cardBg}dd`}
            glow={`${C.gold}22`} style={{ padding: "22px 36px" }}>
            <div style={{ display: "flex", gap: 0 }}>
              {/* Label column */}
              <div style={{ width: 260, flexShrink: 0 }}>
                <div style={{ fontFamily: FONT, fontSize: 18, color: C.spirit, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${C.border}` }}>
                  ATTRIBUTE
                </div>
                {tableRows.map((row, i) => {
                  const rOp = interpolate(frame, [90 + i * 16, 108 + i * 16], [0, 1], { extrapolateRight: "clamp" });
                  return <div key={i} style={{ fontFamily: FONT, fontSize: 17, color: C.spirit, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}44`, opacity: rOp }}>{row.label}</div>;
                })}
              </div>
              {/* Before column */}
              <div style={{ flex: 1, paddingLeft: 28, borderLeft: `2px solid ${C.border}55` }}>
                <div style={{ fontFamily: FONT, fontSize: 18, color: C.crimson, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${C.border}` }}>
                  💀 BEFORE
                </div>
                {tableRows.map((row, i) => {
                  const rOp = interpolate(frame, [90 + i * 16, 108 + i * 16], [0, 1], { extrapolateRight: "clamp" });
                  return <div key={i} style={{ fontFamily: FONT, fontSize: 17, color: C.spirit, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}44`, opacity: rOp }}>{row.before}</div>;
                })}
              </div>
              {/* After column */}
              <div style={{ flex: 1.5, paddingLeft: 28, borderLeft: `2px solid ${C.border}55` }}>
                <div style={{ fontFamily: FONT, fontSize: 18, color: C.gold, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${C.border}`, textShadow: `0 0 12px ${C.gold}55` }}>
                  ✨ AFTER
                </div>
                {tableRows.map((row, i) => {
                  const rOp = interpolate(frame, [90 + i * 16, 108 + i * 16], [0, 1], { extrapolateRight: "clamp" });
                  return <div key={i} style={{ fontFamily: FONT, fontSize: 17, color: row.afterColor, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}44`, opacity: rOp, textShadow: `0 0 8px ${row.afterColor}44` }}>{row.after}</div>;
                })}
              </div>
            </div>
          </NESBox>
        </div>

        {/* Share buttons */}
        <div style={{ display: "flex", gap: 20, opacity: shareOp }}>
          <NESBox width={300} borderColor={`${C.white}55`} bgColor={`${C.white}08`}
            glow={`${C.white}22`} style={{ padding: "16px 0", textAlign: "center" }}>
            <PxText text="𝕏 SHARE ON X" size={18} color={C.white} />
          </NESBox>
          <NESBox width={340} borderColor={`${C.cyan}55`} bgColor={`${C.cyan}08`}
            glow={`${C.cyan}22`} style={{ padding: "16px 0", textAlign: "center" }}>
            <PxText text="VIEW ON EXPLORER" size={18} color={C.cyan} />
          </NESBox>
        </div>
      </div>

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 5: GALLERY (frames 1378-1558, ~6s)
// Filter tabs | Search | 3x2 NFT grid | Stats bar
// ============================================================================
const DemoScene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: "clamp" });
  const filterOp = interpolate(frame, [18, 34], [0, 1], { extrapolateRight: "clamp" });
  const statsOp = interpolate(frame, [120, 138], [0, 1], { extrapolateRight: "clamp" });

  const nfts = [
    { img: "nfts/bayc8817.png", label: "BAYC #8817", chain: "SOL" },
    { img: "nfts/azuki9605.png", label: "AZUKI #9605", chain: "SOL" },
    { img: "nfts/milady4269.png", label: "MILADY #4269", chain: "SOL" },
    { img: "nfts/pudgy6529.png", label: "PUDGY #6529", chain: "SOL" },
    { img: "nfts/madlad4200.png", label: "MAD LAD #4200", chain: "SOL" },
    { img: "nfts/bayc8817.png", label: "BAYC #0042", chain: "SOL" },
  ];

  const filterTabs = [
    { label: "ALL (6)", active: true },
    { label: "FROM ETH (4)", active: false },
    { label: "FROM SOL (2)", active: false },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <StarField density={40} />
      <Orbs count={20} color={C.green} speed={0.4} size={2} />

      <StepProgressBar activeStep={4} />

      {/* Header + filter bar */}
      <div style={{
        position: "absolute", top: 100, left: 80, right: 80,
        paddingTop: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, opacity: headerOp }}>
          <div style={{ fontFamily: FONT, fontSize: 32, color: C.green, letterSpacing: 3,
            textShadow: `0 0 20px ${C.green}66` }}>
            YOUR REBORN COLLECTION
          </div>
          <div style={{ fontFamily: FONT, fontSize: 18, color: C.gold,
            textShadow: `0 0 10px ${C.gold}55` }}>
            6 NFTs Reborn
          </div>
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", opacity: filterOp }}>
          {filterTabs.map((tab, i) => (
            <div key={i} style={{
              fontFamily: FONT, fontSize: 15,
              color: tab.active ? C.deep : C.spirit,
              backgroundColor: tab.active ? C.green : `${C.border}55`,
              border: `2px solid ${tab.active ? C.green : C.border}`,
              padding: "8px 18px",
              letterSpacing: 1,
              boxShadow: tab.active ? `0 0 14px ${C.green}55` : "none",
            }}>{tab.label}</div>
          ))}

          {/* Search bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            border: `2px solid ${C.spirit}44`,
            backgroundColor: `${C.cardBg}aa`,
            padding: "8px 16px", flex: 1, maxWidth: 400,
          }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <span style={{ fontFamily: FONT, fontSize: 14, color: `${C.spirit}88`, letterSpacing: 1 }}>
              Search your reborn collection...
            </span>
          </div>
        </div>
      </div>

      {/* 3x2 NFT grid — 360px cards × 3 cols = 1128px, 2 rows fit in screen */}
      <div style={{
        position: "absolute", top: 210, left: "50%",
        transform: "translateX(-50%)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 360px)",
        gap: 24,
      }}>
        {nfts.map((nft, i) => {
          const s = spring({ frame: frame - i * 14, fps, config: { damping: 12, stiffness: 90 } });
          return (
            <div key={i} style={{
              transform: `scale(${s}) translateY(${interpolate(s, [0, 1], [24, 0])}px)`,
              opacity: s,
            }}>
              <DemoNFTCard image={nft.img} label={nft.label} chain={nft.chain}
                chainColor={C.sol} size={350} reborn />
            </div>
          );
        })}
      </div>

      {/* Stats bar at bottom */}
      {frame >= 120 && (
        <div style={{
          position: "absolute", bottom: 30, left: "50%",
          transform: "translateX(-50%)",
          opacity: statsOp,
        }}>
          <NESBox width={1128} borderColor={`${C.green}55`} bgColor={`${C.green}0a`}
            glow={`${C.green}22`} style={{ padding: "20px 40px" }}>
            <div style={{ display: "flex", gap: 0, justifyContent: "space-around" }}>
              {[
                { label: "NFTs Reborn", value: "6", color: C.gold },
                { label: "Collections", value: "3", color: C.cyan },
                { label: "Gas Remaining", value: "$0", color: C.green },
                { label: "Est. Value", value: "~$240", color: C.white },
              ].map((stat, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: FONT, fontSize: 28, color: stat.color,
                    textShadow: `0 0 14px ${stat.color}55`, marginBottom: 8 }}>{stat.value}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </NESBox>
        </div>
      )}

      <CRT intensity={0.4} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 6: GUILD (frames 1558-1800, ~8s)
// Left: guild banner + title + 3 feature panels | Right: mock voting UI | Bottom: stats
// ============================================================================
const DemoSceneGuild: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entry flash
  const flashOp = frame < 16 ? interpolate(frame, [0, 16], [0.85, 0]) : 0;

  const panelOp = interpolate(frame, [8, 24], [0, 1], { extrapolateRight: "clamp" });
  const titleOp = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });

  // Feature panels animate in on beats 2,3,4 → frames 36,54,72
  const featurePanelBeats = [36, 54, 72];

  // Voting UI: beat 6 → frame 90
  const votingOp = interpolate(frame, [90, 108], [0, 1], { extrapolateRight: "clamp" });

  // Voting progress bar animates from 0 to 89% between frames 108-162
  const votingProgress = interpolate(frame, [108, 162], [0, 0.89], { extrapolateRight: "clamp" });

  // Stats row: beat 9 → frame 162
  const statsOp = interpolate(frame, [162, 180], [0, 1], { extrapolateRight: "clamp" });

  const glowPulse = Math.sin(frame * 0.07) * 0.5 + 0.5;

  const features = [
    { icon: "🗳", title: "DAO VOTING", desc: "Community votes on which dead collections to resurrect", color: C.cyan },
    { icon: "💰", title: "ROYALTY SPLITS", desc: "5% royalties on all trades, split to original holders", color: C.gold },
    { icon: "🏦", title: "TREASURY", desc: "Guild treasury funds gas, marketing, and development", color: C.green },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.void }}>
      <StarField density={60} />
      <Orbs count={20} color={C.gold} speed={0.6} size={3} />
      <Orbs count={15} color={GUILD_COLOR} speed={0.4} size={2} />
      <Orbs count={10} color={C.green} speed={0.3} size={2} />

      {/* Background ritual circle */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.04 }}>
        <RitualCircle size={1000} progress={1} glowColor={GUILD_COLOR} />
      </div>

      {/* Entry flash */}
      {flashOp > 0 && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: GUILD_COLOR, zIndex: 300, opacity: flashOp }} />
      )}

      <StepProgressBar activeStep={5} />

      {/* LEFT PANEL: guild banner + title + feature panels */}
      <div style={{
        position: "absolute", left: 80, top: 106, width: 900,
        paddingTop: 20, display: "flex", flexDirection: "column", gap: 20,
      }}>
        {/* Guild banner + title */}
        <div style={{ opacity: titleOp, display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{
            filter: `drop-shadow(0 0 24px ${C.gold}aa) drop-shadow(0 0 48px ${C.gold}33)`,
            flexShrink: 0,
          }}>
            <Img src={staticFile("art/guild-banner.png")} width={76} height={76}
              style={{ imageRendering: "pixelated" }} />
          </div>
          <div>
            <div style={{
              fontFamily: FONT, fontSize: 38, color: C.gold, letterSpacing: 3,
              textShadow: `0 0 28px ${C.gold}, 0 0 56px ${C.gold}44`,
              lineHeight: 1.2,
            }}>THE ADVENTURER'S GUILD</div>
            <div style={{ fontFamily: FONT, fontSize: 16, color: C.white, letterSpacing: 2, marginTop: 10, opacity: 0.85 }}>
              Community-Governed NFT Resurrection
            </div>
          </div>
        </div>

        {/* 3 feature panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {features.map((feat, i) => {
            const op = interpolate(frame, [featurePanelBeats[i], featurePanelBeats[i] + 16], [0, 1], { extrapolateRight: "clamp" });
            const slideX = interpolate(frame, [featurePanelBeats[i], featurePanelBeats[i] + 22], [-44, 0], { extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ opacity: op, transform: `translateX(${slideX}px)` }}>
                <NESBox width={870} borderColor={`${feat.color}66`} bgColor={`${feat.color}0a`}
                  glow={`${feat.color}22`} style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 26, flexShrink: 0, marginTop: 2 }}>{feat.icon}</span>
                    <div>
                      <div style={{
                        fontFamily: FONT, fontSize: 19, color: feat.color, marginBottom: 8,
                        textShadow: `0 0 10px ${feat.color}66`, letterSpacing: 2,
                      }}>
                        {feat.title}
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 14, color: C.white, lineHeight: 1.7 }}>
                        {feat.desc}
                      </div>
                    </div>
                  </div>
                </NESBox>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL: Voting UI */}
      <div style={{
        position: "absolute", right: 80, top: 106, width: 820,
        paddingTop: 20, opacity: votingOp,
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        {/* Main voting proposal box */}
        <NESBox width={800} borderColor={`${C.gold}77`} bgColor={`${C.cardBg}dd`}
          glow={`${C.gold}33`} style={{ padding: "22px 26px" }}>
          <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, marginBottom: 12, letterSpacing: 2 }}>
            ⚡ ACTIVE PROPOSAL
          </div>
          <div style={{
            fontFamily: FONT, fontSize: 20, color: C.gold, marginBottom: 18,
            textShadow: `0 0 12px ${C.gold}55`, lineHeight: 1.4,
          }}>
            Resurrect Bored Ape Yacht Club
          </div>

          {/* Vote counts row */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 10, height: 10, backgroundColor: C.green, boxShadow: `0 0 8px ${C.green}` }} />
              <span style={{ fontFamily: FONT, fontSize: 14, color: C.green }}>FOR: 89% (1,247 votes)</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 10, height: 10, backgroundColor: C.crimson, boxShadow: `0 0 8px ${C.crimson}` }} />
              <span style={{ fontFamily: FONT, fontSize: 14, color: C.crimson }}>AGAINST: 11% (156 votes)</span>
            </div>
          </div>

          {/* Animated progress bar */}
          <div style={{
            width: "100%", height: 26,
            backgroundColor: `${C.crimson}55`,
            border: `3px solid ${C.border}`,
            position: "relative", overflow: "hidden",
            marginBottom: 18,
          }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${votingProgress * 100}%`,
              backgroundColor: C.green,
              boxShadow: `0 0 14px ${C.green}, 0 0 28px ${C.green}44`,
            }} />
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                fontFamily: FONT, fontSize: 13, color: C.white,
                textShadow: "0 0 4px #000, 0 0 8px #000",
              }}>
                {Math.round(votingProgress * 100)}% FOR
              </span>
            </div>
          </div>

          {/* Time / votes / vote button row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: `2px solid ${C.border}44`, paddingTop: 14,
          }}>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.spirit, marginBottom: 6 }}>TIME REMAINING</div>
              <div style={{ fontFamily: FONT, fontSize: 20, color: C.cyan, textShadow: `0 0 10px ${C.cyan}66` }}>2d 14h</div>
            </div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.spirit, marginBottom: 6 }}>TOTAL VOTES</div>
              <div style={{ fontFamily: FONT, fontSize: 20, color: C.white }}>1,403</div>
            </div>
            <NESBox width={170} borderColor={`${C.green}77`} bgColor={`${C.green}18`}
              glow={`${C.green}33`} style={{ padding: "10px 14px", textAlign: "center" }}>
              <div style={{
                fontFamily: FONT, fontSize: 16, color: C.green,
                textShadow: `0 0 8px ${C.green}77`,
              }}>VOTE NOW</div>
            </NESBox>
          </div>
        </NESBox>

        {/* Quorum / Threshold info boxes */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "QUORUM", value: "51%", detail: "Required to pass", color: C.gold },
            { label: "THRESHOLD", value: "75%", detail: "Current: 89% ✓", color: C.green },
          ].map((info, i) => (
            <NESBox key={i} width={384} borderColor={`${info.color}55`} bgColor={`${info.color}08`}
              style={{ padding: "16px 18px" }}>
              <div style={{ fontFamily: FONT, fontSize: 13, color: C.spirit, marginBottom: 6 }}>{info.label}</div>
              <div style={{ fontFamily: FONT, fontSize: 24, color: info.color, marginBottom: 6, textShadow: `0 0 10px ${info.color}44` }}>{info.value}</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.white }}>{info.detail}</div>
            </NESBox>
          ))}
        </div>
      </div>

      {/* Bottom stats row */}
      {frame >= 162 && (
        <div style={{
          position: "absolute", bottom: 30, left: "50%",
          transform: "translateX(-50%)",
          opacity: statsOp,
        }}>
          <NESBox width={1600} borderColor={`${C.gold}55`} bgColor={`${C.gold}0a`}
            glow={`${C.gold}22`} style={{ padding: "18px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
              {[
                { label: "Collections Resurrected", value: "12", color: C.gold },
                { label: "Guild Members", value: "45,000", color: GUILD_COLOR },
                { label: "Treasury", value: "$230K", color: C.green },
              ].map((stat, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: FONT, fontSize: 30, color: stat.color,
                    textShadow: `0 0 16px ${stat.color}55`, marginBottom: 8,
                  }}>{stat.value}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </NESBox>
        </div>
      )}

      <CRT intensity={0.5} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// SCENE 7: CTA (frames 1800-2034, ~8s)
// Full-screen dramatic: mascot, JOIN THE GUILD, BEGIN THE RITUAL, socials
// ============================================================================
const DemoScene7CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mascotS = spring({ frame: frame - 5, fps, config: { damping: 8, stiffness: 70 } });
  const titleOp = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: "clamp" });
  const subtitleOp = interpolate(frame, [30, 48], [0, 1], { extrapolateRight: "clamp" });
  const ctaOp = interpolate(frame, [54, 72], [0, 1], { extrapolateRight: "clamp" });
  const urlOp = interpolate(frame, [72, 90], [0, 1], { extrapolateRight: "clamp" });
  const socialOp = interpolate(frame, [90, 108], [0, 1], { extrapolateRight: "clamp" });
  const poweredOp = interpolate(frame, [108, 126], [0, 1], { extrapolateRight: "clamp" });
  const ctaPulse = 1 + Math.sin(frame * 0.12) * 0.04;
  const glowPulse = 28 + Math.sin(frame * 0.08) * 18;

  const socialLinks = [
    { icon: "𝕏", label: "TWITTER", color: C.white },
    { icon: "💬", label: "DISCORD", color: "#5865F2" },
    { icon: "✈️", label: "TELEGRAM", color: "#26A5E4" },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.void }}>
      <StarField density={100} />
      <Orbs count={45} color={C.pink} speed={1.2} size={3} />
      <Orbs count={25} color={C.gold} speed={0.7} size={2} />

      {/* Background circle */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.08 }}>
        <RitualCircle size={1100} progress={1} glowColor={C.pink} />
      </div>

      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 0,
      }}>
        {/* Mascot */}
        <div style={{
          transform: `scale(${mascotS})`, opacity: mascotS,
          filter: `drop-shadow(0 0 ${glowPulse}px ${C.pink}) drop-shadow(0 0 ${glowPulse * 0.7}px ${C.gold}55)`,
          marginBottom: 24,
        }}>
          <Img src={staticFile("art/ika-mascot-v2.png")} width={200} height={200}
            style={{ imageRendering: "pixelated" }} />
        </div>

        {/* Title */}
        <div style={{ opacity: titleOp, marginBottom: 12 }}>
          <div style={{
            fontFamily: FONT, fontSize: 64, color: C.gold, letterSpacing: 6,
            textShadow: `0 0 40px ${C.gold}, 0 0 80px ${C.gold}44`,
            textAlign: "center",
          }}>JOIN THE GUILD</div>
        </div>

        {/* Subtitle */}
        <div style={{ opacity: subtitleOp, marginBottom: 32 }}>
          <div style={{ fontFamily: FONT, fontSize: 24, color: C.white, letterSpacing: 2,
            textAlign: "center" }}>
            Resurrect your collection today
          </div>
        </div>

        {/* CTA button */}
        <div style={{ opacity: ctaOp, transform: `scale(${ctaPulse})`, marginBottom: 28 }}>
          <NESBox width={600} borderColor={C.pink} bgColor={`${C.pink}20`}
            glow={`${C.pink}66`} style={{ padding: "22px 0", textAlign: "center" }}>
            <div style={{ fontFamily: FONT, fontSize: 28, color: C.pink, letterSpacing: 4,
              textShadow: `0 0 20px ${C.pink}, 0 0 40px ${C.pink}55` }}>
              ✦ BEGIN THE RITUAL ✦
            </div>
          </NESBox>
        </div>

        {/* URL */}
        <div style={{ opacity: urlOp, marginBottom: 24 }}>
          <NESBox width={440} borderColor={`${C.gold}55`} bgColor={`${C.gold}0a`}
            style={{ padding: "16px 28px", textAlign: "center" }}>
            <div style={{ fontFamily: FONT, fontSize: 22, color: C.gold, letterSpacing: 4,
              textShadow: `0 0 16px ${C.gold}66` }}>
              ikatensei.xyz
            </div>
          </NESBox>
        </div>

        {/* Social row */}
        {frame >= 90 && (
          <div style={{ display: "flex", gap: 20, opacity: socialOp, marginBottom: 20 }}>
            {socialLinks.map((s, i) => {
              const ss = spring({ frame: frame - 90 - i * 14, fps, config: { damping: 14, stiffness: 120 } });
              return (
                <div key={i} style={{ transform: `scale(${ss})`, opacity: ss }}>
                  <NESBox width={160} borderColor={`${s.color}66`} bgColor={`${s.color}0c`}
                    glow={`${s.color}22`} style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontFamily: FONT, fontSize: 14, color: s.color, letterSpacing: 1 }}>{s.label}</div>
                  </NESBox>
                </div>
              );
            })}
          </div>
        )}

        {/* Powered by */}
        <div style={{ opacity: poweredOp * 0.65 }}>
          <div style={{ fontFamily: FONT, fontSize: 14, color: C.spirit, letterSpacing: 2, textAlign: "center" }}>
            POWERED BY IKA × DWALLET NETWORK
          </div>
        </div>
      </div>

      <CRT intensity={0.6} />
      <PixelGrid />
    </AbsoluteFill>
  );
};

// ============================================================================
// FLASH CUT
// ============================================================================
const DemoFlashCut: React.FC<{ at: number; color: string; duration?: number }> = ({ at, color, duration = 6 }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2 || frame > at + duration) return null;
  if (frame < at) return <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", zIndex: 300 }} />;
  return <div style={{
    position: "absolute", inset: 0, zIndex: 300, backgroundColor: color,
    opacity: interpolate(frame, [at, at + duration], [0.85, 0]),
  }} />;
};

// ============================================================================
// MAIN — beat-aligned @ 100.4 BPM, 30fps = 2034 frames (67.8s)
// Beat interval: 18 frames (~0.598s)
// Scene 1: 0-297    Scene 2: 297-657   Scene 3: 657-1017
// Scene 4: 1017-1378  Scene 5: 1378-1558  Scene 6(Guild): 1558-1800  Scene 7(CTA): 1800-2034
// ============================================================================
export const ProductDemo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.deep }}>
    <Audio src={staticFile("music/bgm.mp3")} />

    <Sequence from={0} durationInFrames={297}><DemoScene1 /></Sequence>
    <Sequence from={297} durationInFrames={360}><DemoScene2 /></Sequence>
    <Sequence from={657} durationInFrames={360}><DemoScene3 /></Sequence>
    <Sequence from={1017} durationInFrames={361}><DemoScene4 /></Sequence>
    <Sequence from={1378} durationInFrames={180}><DemoScene5 /></Sequence>
    <Sequence from={1558} durationInFrames={242}><DemoSceneGuild /></Sequence>
    <Sequence from={1800} durationInFrames={234}><DemoScene7CTA /></Sequence>

    <DemoFlashCut at={297} color="#00ccff" />
    <DemoFlashCut at={657} color="#ff3366" />
    <DemoFlashCut at={1017} color="#ffd700" />
    <DemoFlashCut at={1378} color="#00ff88" />
    <DemoFlashCut at={1558} color={GUILD_COLOR} />
    <DemoFlashCut at={1800} color="#ff3366" />
  </AbsoluteFill>
);
