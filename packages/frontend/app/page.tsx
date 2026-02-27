"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { SealIcon, SoulOrb, ShieldIcon, ChainBadge, PortalIcon, ScrollIcon, CrownIcon } from "@/components/ui/PixelSprite";
import { SummoningCircle } from "@/components/ui/SummoningCircle";
import { BackgroundAtmosphere } from "@/components/ui/BackgroundAtmosphere";
import { DialogueBox } from "@/components/ui/DialogueBox";
import { PixelButton } from "@/components/ui/PixelButton";
import { StatsCounter } from "@/components/ui/StatsCounter";
// SakuraParticles removed per user request
import { useKonamiCode } from "@/hooks/useKonamiCode";

// ============================================================================
// FLOATING KANJI/RUNE PARTICLES - Drifting magical particles for hero
// ============================================================================
const RUNE_PARTICLES = [
  "死", "魔", "魂", "転", "生", "封印", "儀", "式", "☆", "✦", "⚡", "✧",
  "ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛁ", "ᛃ",
  "梵", "◆", "✦"
];

interface Particle {
  id: number;
  char: string;
  x: number;
  y: number;
  duration: number;
  delay: number;
  size: number;
  opacity: number;
  rotation: number;
}

function FloatingRuneParticles() {
  const [particles] = useState<Particle[]>(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      char: RUNE_PARTICLES[Math.floor(Math.random() * RUNE_PARTICLES.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: 10 + Math.random() * 15,
      delay: Math.random() * 5,
      size: 14 + Math.random() * 18,
      opacity: 0.15 + Math.random() * 0.35,
      rotation: -30 + Math.random() * 60,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute font-jp"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: p.size,
            opacity: p.opacity,
            color: Math.random() > 0.5 ? '#ffd700' : '#9b59b6',
            textShadow: '0 0 10px currentColor',
          }}
          animate={{
            y: [0, -60, 0],
            x: [0, Math.sin(p.id) * 25, 0],
            rotate: [p.rotation, p.rotation + 15, p.rotation],
            opacity: [p.opacity, p.opacity * 0.4, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {p.char}
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// ETHEREAL MIST - Bottom atmosphere for sections
// ============================================================================
function EtherealMist() {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none overflow-hidden">
      {/* Multiple layers of fog */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: 80 + i * 25,
            background: `linear-gradient(to top, rgba(155, 89, 182, ${0.12 - i * 0.03}), transparent)`,
            filter: 'blur(15px)',
          }}
          animate={{
            x: [0, 80, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 12 + i * 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 2,
          }}
        />
      ))}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-void-purple via-mystic-purple/15 to-transparent" />
    </div>
  );
}

// ============================================================================
// FILM GRAIN + VIGNETTE OVERLAY
// ============================================================================
function FilmGrainOverlay() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {/* Film grain texture */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          animation: 'grain 0.5s steps(1) infinite',
        }}
      />
      {/* Vignette */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(5, 3, 8, 0.4) 100%)',
        }}
      />
      <style jsx global>{`
        @keyframes grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1%, -1%); }
          20% { transform: translate(1%, 1%); }
          30% { transform: translate(-1%, 1%); }
          40% { transform: translate(1%, -1%); }
          50% { transform: translate(-1%, 0%); }
          60% { transform: translate(1%, 0%); }
          70% { transform: translate(0%, 1%); }
          80% { transform: translate(0%, -1%); }
          90% { transform: translate(1%, 1%); }
        }
      `}</style>
    </div>
  );
}

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Konami code easter egg
  const { isActivated: konamiActivated } = useKonamiCode();
  const { scrollY } = useScroll();
  
  // Parallax transforms for hero
  const yBackground = useTransform(scrollY, [0, 500], [0, 80]);
  const yMascot = useTransform(scrollY, [0, 300], [0, -40]);
  
  // CTA hover state for summoning circle interaction
  const [isCtaHovered, setIsCtaHovered] = useState(false);

  // Trigger pulse on mount for initial attention
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const STEPS = [
    {
      icon: <SealIcon size={48} />,
      title: "Seal",
      desc: "Send your NFT to a secure deposit address. No bridges, no wrapping. Just a simple transfer.",
    },
    {
      icon: <SoulOrb size={48} />,
      title: "Reborn",
      desc: "Your NFT is reborn on Solana with every trait, attribute, and piece of history intact.",
    },
    {
      icon: <ShieldIcon size={48} />,
      title: "Join Guild",
      desc: "Your reborn NFT unlocks the Guild. Vote on which dead collections to resurrect next.",
    },
  ];

  return (
    <div ref={containerRef} className="min-h-screen relative">
      <BackgroundAtmosphere mood="calm" />
      <FilmGrainOverlay />
      
      {/* Konami code easter egg overlay */}
      {konamiActivated && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            background: "rgba(5, 3, 8, 0.9)",
          }}
        >
          <motion.div
            initial={{ scale: 0.5, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 12 }}
            className="text-center"
          >
            {/* Rainbow glow title */}
            <motion.h2
              className="font-pixel text-3xl md:text-4xl mb-6"
              animate={{
                textShadow: [
                  "0 0 20px #ff0000, 0 0 40px #ff0000, 0 0 60px #ff0000",
                  "0 0 20px #ff8800, 0 0 40px #ff8800, 0 0 60px #ff8800",
                  "0 0 20px #ffff00, 0 0 40px #ffff00, 0 0 60px #ffff00",
                  "0 0 20px #00ff00, 0 0 40px #00ff00, 0 0 60px #00ff00",
                  "0 0 20px #0088ff, 0 0 40px #0088ff, 0 0 60px #0088ff",
                  "0 0 20px #8800ff, 0 0 40px #8800ff, 0 0 60px #8800ff",
                  "0 0 20px #ff0000, 0 0 40px #ff0000, 0 0 60px #ff0000",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity }}
              style={{ color: "#fff" }}
            >
              🦑 IKA TENSEI 🦑
            </motion.h2>
            
            <DialogueBox
              speaker="Ika"
              portrait="excited"
              text="You found the secret! 🦑 The ancient squid blesses you with infinite luck~"
            />
          </motion.div>
        </motion.div>
      )}

      {/* SECTION 1 - HERO */}
      <section className="relative flex flex-col items-center justify-center min-h-[100vh] px-4 overflow-hidden">
        {/* Floating rune particles */}
        <FloatingRuneParticles />
        
        {/* Sakura petals - subtle background effect */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Sakura removed */}
        </div>

        {/* Hero background art - mirrored on both sides, center clear for content - with parallax */}
        <motion.div 
          className="absolute inset-0 z-0 opacity-30 overflow-hidden"
          style={{ y: yBackground }}
        >
          {/* Left side - flipped so statue faces outward left */}
          <div className="absolute inset-y-0 left-0 w-[60%]" style={{ maskImage: 'linear-gradient(to right, black 30%, black 50%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 30%, black 50%, transparent 100%)' }}>
            <Image
              src="/art/hero-wide.png"
              alt=""
              fill
              className="object-cover object-center"
              style={{ transform: 'scaleX(-1)' }}
              priority
            />
          </div>
          {/* Right side - normal orientation, statue faces outward right */}
          <div className="absolute inset-y-0 right-0 w-[60%]" style={{ maskImage: 'linear-gradient(to left, black 30%, black 50%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to left, black 30%, black 50%, transparent 100%)' }}>
            <Image
              src="/art/hero-wide.png"
              alt=""
              fill
              className="object-cover object-center"
              priority
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-void-purple/40 via-transparent to-void-purple" />
        </motion.div>

        {/* Summoning Circle - dead center, no parallax drift */}
        <div className="absolute inset-0 flex items-center justify-center z-[1] pointer-events-none">
          <motion.div
            animate={isCtaHovered ? {
              scale: [1, 1.05, 1.03],
              filter: ['drop-shadow(0 0 20px #ff3366)', 'drop-shadow(0 0 35px #ff3366)', 'drop-shadow(0 0 25px #ff3366)'],
            } : {}}
            transition={{ duration: 1, repeat: isCtaHovered ? Infinity : 0 }}
          >
            <SummoningCircle 
              size={500} 
              phase={isCtaHovered ? "active" : mounted ? "charging" : "idle"} 
            />
          </motion.div>
        </div>

        {/* Mascot - pixel art goddess with bobbing animation + parallax */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 mb-6"
          style={{ y: yMascot, filter: "drop-shadow(0 8px 24px rgba(255, 51, 102, 0.3))" }}
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Image
              src="/art/ika-chibi.png"
              alt="Ika - Squid Goddess"
              width={200}
              height={200}
              className="pixelated"
              style={{ imageRendering: "pixelated" }}
              priority
            />
          </motion.div>
        </motion.div>

        {/* Title with staggered entrance + strong visibility */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="font-pixel text-4xl md:text-6xl text-center mb-4 relative z-10 flex gap-3"
        >
          <motion.span
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            style={{
              color: konamiActivated ? undefined : "#ff3366",
              textShadow: konamiActivated 
                ? "0 0 20px #ff0000, 0 0 40px #ff8800, 0 0 60px #ffff00, 0 0 80px #00ff00, 0 0 100px #0088ff"
                : "0 0 20px rgba(255, 51, 102, 0.8), 0 0 40px rgba(255, 51, 102, 0.4), 0 0 80px rgba(255, 51, 102, 0.2), 0 2px 0 #cc1144",
              WebkitTextStroke: "1px rgba(255, 51, 102, 0.3)",
            }}
          >
            イカ
          </motion.span>
          <motion.span
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            style={{
              color: konamiActivated ? undefined : "#ffd700",
              textShadow: konamiActivated
                ? "0 0 20px #ff0000, 0 0 40px #ff8800, 0 0 60px #ffff00, 0 0 80px #00ff00, 0 0 100px #0088ff"
                : "0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.4), 0 0 80px rgba(255, 215, 0, 0.2), 0 2px 0 #cc8800",
              WebkitTextStroke: "1px rgba(255, 215, 0, 0.3)",
            }}
          >
            転生
          </motion.span>
        </motion.h1>

        {/* Subtitle with background pill for readability */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="relative z-10 mb-6"
        >
          <p
            className="font-pixel text-[10px] tracking-[0.3em] text-ghost-white/90 px-4 py-1.5 inline-block"
            style={{
              background: "rgba(13, 10, 26, 0.7)",
              border: "1px solid rgba(255, 215, 0, 0.2)",
              textShadow: "0 0 8px rgba(255, 215, 0, 0.3)",
            }}
          >
            YOUR NFT DESERVES A SECOND LIFE
          </p>
        </motion.div>

        {/* Description */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="text-center mb-10 relative z-10"
        >
          <p
            className="font-silk text-base md:text-lg"
            style={{
              color: "#e8e0f0",
              textShadow: "0 0 10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.9)",
            }}
          >
            Dead collection? Floor at zero? Your PFP is still you. Bring it back to life.
          </p>
        </motion.div>

        {/* CTA Button - triggers summoning circle pulse on hover */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.1 }}
          className="relative z-10"
          onMouseEnter={() => setIsCtaHovered(true)}
          onMouseLeave={() => setIsCtaHovered(false)}
        >
          <Link href="/seal" className="relative inline-block group">
            {/* Sparkle particles around button */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1"
                style={{
                  background: i % 2 === 0 ? "#ffd700" : "#ff3366",
                  boxShadow: `0 0 4px ${i % 2 === 0 ? "#ffd700" : "#ff3366"}`,
                  left: `${10 + i * 16}%`,
                  top: i % 2 === 0 ? "-8px" : "calc(100% + 4px)",
                }}
                animate={{
                  y: [0, -8, 0],
                  opacity: [0, 1, 0],
                  scale: [0.5, 1.2, 0.5],
                }}
                transition={{
                  duration: 1.5 + i * 0.2,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              />
            ))}

            {/* Button glow backdrop - intensifies on hover */}
            <motion.div
              className="absolute inset-0 -m-2 rounded-lg"
              animate={{
                boxShadow: isCtaHovered 
                  ? ["0 0 30px rgba(255, 51, 102, 0.4), 0 0 60px rgba(255, 51, 102, 0.3)", "0 0 50px rgba(255, 51, 102, 0.6), 0 0 100px rgba(255, 51, 102, 0.4)", "0 0 30px rgba(255, 51, 102, 0.4), 0 0 60px rgba(255, 51, 102, 0.3)"]
                  : ["0 0 20px rgba(255, 51, 102, 0.2), 0 0 40px rgba(255, 51, 102, 0.1)", "0 0 30px rgba(255, 51, 102, 0.4), 0 0 60px rgba(255, 51, 102, 0.2)", "0 0 20px rgba(255, 51, 102, 0.2), 0 0 40px rgba(255, 51, 102, 0.1)"],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            <motion.button
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="relative font-pixel text-sm md:text-base px-8 md:px-12 py-4 text-ghost-white"
              style={{
                background: "linear-gradient(135deg, #ff3366, #cc1144, #ff3366)",
                backgroundSize: "200% 200%",
                border: "2px solid #ff336688",
                boxShadow: "0 4px 0 #880022, 0 0 20px rgba(255, 51, 102, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
                animation: "shimmer 3s ease infinite",
              }}
            >
              {/* Pixel corner decorations */}
              <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-ritual-gold/60" />
              <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-ritual-gold/60" />
              <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-ritual-gold/60" />
              <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-ritual-gold/60" />
              ⚔ Begin the Ritual
            </motion.button>
          </Link>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.3 }}
          className="flex gap-8 md:gap-12 mt-16 relative z-10"
        >
          <StatsCounter target={4} label="Chains" icon={<ChainBadge chain="ethereum" size={20} />} />
          <StatsCounter target={0} label="Sealed" icon={<SealIcon size={20} />} />
          <StatsCounter target={0} label="Reborn" icon={<SoulOrb size={20} />} />
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.5 }}
          className="absolute bottom-8 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="font-pixel text-xs text-faded-spirit"
          >
            ▼
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
           SECTION 2 - HOW IT WORKS (TAROT RITUAL PROGRESSION)
           ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-4 relative z-10 overflow-hidden">
        {/* Deep shrine atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-void-purple via-ritual-dark to-void-purple" />
        
        {/* Floating ritual particles - reduced count */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute font-pixel text-xs"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${Math.random() * 100}%`,
                color: i % 3 === 0 ? '#ffd700' : i % 3 === 1 ? '#ff3366' : '#9b59b6',
                opacity: 0.15 + Math.random() * 0.15,
              }}
              animate={{
                y: [0, -50, 0],
                x: [0, Math.sin(i) * 20, 0],
                opacity: [0.15, 0.25, 0.15],
              }}
              transition={{
                duration: 10 + Math.random() * 6,
                repeat: Infinity,
                delay: Math.random() * 5,
              }}
            >
              {["✦", "◆", "✧", "☆", "⚔", "封"][i % 6]}
            </motion.div>
          ))}
        </div>

        {/* Grimoire-style divider */}
        <div className="relative max-w-2xl mx-auto mb-16">
          <div className="h-px bg-gradient-to-r from-transparent via-sigil-border to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void-purple px-4">
            <span className="font-pixel text-lg text-ritual-gold">⚜</span>
          </div>
        </div>

        {/* Section header with ritual seal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-4 relative"
        >
          {/* Decorative seal */}
          <motion.div
            className="absolute -top-8 left-1/2 -translate-x-1/2 w-16 h-16"
            style={{
              border: '2px solid #ffd70033',
              borderRadius: '50%',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute inset-2 border border-ritual-gold/20 rounded-full" />
            <div className="absolute inset-4 border border-blood-pink/20 rounded-full" />
          </motion.div>
          
          <span className="font-pixel text-[9px] tracking-[0.4em] text-faded-spirit uppercase">Three Steps</span>
          <div className="font-jp text-[10px] text-blood-pink/60 mt-1 tracking-wider">三つの儀式</div>
        </motion.div>
        
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-pixel text-xl md:text-2xl text-center text-ritual-gold text-glow-gold mb-4"
        >
          How It Works
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="font-silk text-sm text-faded-spirit text-center mb-16 max-w-md mx-auto"
        >
          Seal your NFT from any chain. Get it reborn on Solana. Join the community.
        </motion.p>
        
        {/* TAROT-STYLE RITUAL CARDS */}
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
            {[
              {
                ...STEPS[0],
                japanese: "第一の封印",
                meaning: "The Sealing",
                cardColor: "#2a1d4e",
                accentColor: "#627eea",
              },
              {
                ...STEPS[1],
                japanese: "転生",
                meaning: "The Rebirth",
                cardColor: "#4a1d2e",
                accentColor: "#ff3366",
              },
              {
                ...STEPS[2],
                japanese: "公会加入",
                meaning: "The Ascension",
                cardColor: "#1d3a2e",
                accentColor: "#00ff88",
              },
            ].map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 50, rotateY: -15 }}
                whileInView={{ opacity: 1, y: 0, rotateY: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: i * 0.15, type: "spring" }}
                className="relative group"
              >
                {/* Card frame decoration */}
                <div className="absolute -inset-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="absolute inset-0" style={{
                    background: `linear-gradient(135deg, ${step.accentColor}22, transparent 50%, ${step.accentColor}22)`,
                    filter: 'blur(8px)',
                  }} />
                </div>

                {/* Main tarot card */}
                <div
                  className="relative p-6 min-h-[340px] flex flex-col"
                  style={{
                    background: `linear-gradient(180deg, ${step.cardColor}, #0d0a1a)`,
                    border: `2px solid ${step.accentColor}44`,
                    boxShadow: `0 0 30px ${step.accentColor}11, inset 0 0 60px rgba(0,0,0,0.5)`,
                  }}
                >
                  {/* Card corner runes */}
                  <div className="absolute top-2 left-3 font-pixel text-[8px]" style={{ color: step.accentColor }}>◆</div>
                  <div className="absolute top-2 right-3 font-pixel text-[8px]" style={{ color: step.accentColor }}>◆</div>
                  <div className="absolute bottom-2 left-3 font-pixel text-[8px]" style={{ color: step.accentColor }}>◆</div>
                  <div className="absolute bottom-2 right-3 font-pixel text-[8px]" style={{ color: step.accentColor }}>◆</div>

                  {/* Card number (tarot style) */}
                  <div className="absolute -top-3 left-4 bg-void-purple px-2 py-0.5">
                    <span className="font-pixel text-[10px]" style={{ color: step.accentColor }}>
                      {["I", "II", "III"][i]}
                    </span>
                  </div>

                  {/* Icon with glowing aura */}
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="mx-auto mb-4 relative"
                  >
                    <div
                      className="w-20 h-20 flex items-center justify-center rounded-full"
                      style={{
                        background: `${step.accentColor}15`,
                        border: `2px solid ${step.accentColor}33`,
                        boxShadow: `0 0 20px ${step.accentColor}22`,
                      }}
                    >
                      {step.icon}
                    </div>
                    {/* Orbiting particles */}
                    <motion.div
                      className="absolute inset-0"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    >
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div
                          key={j}
                          className="absolute w-1 h-1 rounded-full"
                          style={{
                            background: step.accentColor,
                            top: '50%',
                            left: '50%',
                            transform: `rotate(${j * 90}deg) translateY(-35px)`,
                          }}
                        />
                      ))}
                    </motion.div>
                  </motion.div>

                  {/* Japanese title */}
                  <h3 className="font-jp text-lg text-center mb-1" style={{ color: step.accentColor }}>
                    {step.japanese}
                  </h3>

                  {/* English title */}
                  <h4 className="font-pixel text-sm text-ghost-white text-center mb-3">{step.title}</h4>

                  {/* Meaning */}
                  <p className="font-pixel text-[9px] text-faded-spirit text-center mb-4 uppercase tracking-wider">
                    {step.meaning}
                  </p>

                  {/* Divider */}
                  <div className="w-12 h-px mx-auto mb-4" style={{ background: `${step.accentColor}44` }} />

                  {/* Description */}
                  <p className="font-silk text-[11px] text-spirit-silver text-center leading-relaxed flex-1">
                    {step.desc}
                  </p>

                  {/* Card footer decoration */}
                  <div className="mt-4 text-center">
                    <span className="font-pixel text-[10px]" style={{ color: step.accentColor }}>
                      {i === 0 ? "⚔" : i === 1 ? "✦" : "👑"}
                    </span>
                  </div>
                </div>

                {/* Connecting line (desktop) */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-[170px] -right-4 z-10">
                    <motion.div
                      animate={{ x: [0, 5, 0], opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-2xl text-ritual-gold"
                    >
                      ➜
                    </motion.div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
           SECTION 3 - WHY IKA TENSEI (OCCULT SHRINE GRID)
           ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-4 relative z-10 overflow-hidden">
        {/* Darker atmosphere for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-void-purple via-void-black to-void-purple" />
        
        {/* Animated rune pillars on sides - reduced */}
        <div className="absolute left-0 top-0 bottom-0 w-16 opacity-15 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute font-pixel text-xl text-blood-pink"
              style={{ top: `${i * 18 + 10}%`, left: 6 }}
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 4 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
            >
              {["封", "魔", "魂", "死", "黒"][i]}
            </motion.div>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-16 opacity-15 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute font-pixel text-xl text-ritual-gold"
              style={{ top: `${i * 18 + 10}%`, right: 6 }}
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 4 + i * 0.4, repeat: Infinity, delay: i * 0.3 + 0.5 }}
            >
              {["金", "光", "星", "天", "神"][i]}
            </motion.div>
          ))}
        </div>

        {/* Occult divider with symbols */}
        <div className="relative max-w-3xl mx-auto mb-16">
          <div className="h-px bg-gradient-to-r from-transparent via-blood-pink/50 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 bg-void-purple px-3">
            <span className="text-blood-pink">◆</span>
            <span className="font-pixel text-xs text-blood-pink">✧</span>
            <span className="text-ritual-gold">◆</span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-4"
        >
          <span className="font-pixel text-[9px] tracking-[0.4em] text-faded-spirit uppercase">Why It Matters</span>
          <div className="font-jp text-[10px] text-blood-pink/60 mt-1 tracking-wider">転生之力</div>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-pixel text-xl md:text-2xl text-center text-blood-pink mb-4"
        >
          Your Identity, Preserved
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="font-silk text-sm text-faded-spirit text-center mb-16 max-w-lg mx-auto"
        >
          That PFP is more than a jpeg. It&apos;s your identity, your community, your history. We make sure nothing gets lost.
        </motion.p>

        {/* OCCULT SHRINE GRID - Each card is a shrine tablet */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {[
            {
              icon: <ShieldIcon size={32} />,
              title: "No Bridges, No Risk",
              desc: "Your NFT never touches a centralized bridge or multisig. Cryptographic security, not trust assumptions.",
              accent: "#00ff88",
              symbol: "🛡",
              japanese: "防御",
            },
            {
              icon: <SoulOrb size={32} />,
              title: "Every Trait Preserved",
              desc: "Traits, attributes, rarity, provenance. Everything that makes your NFT yours comes with it.",
              accent: "#00ccff",
              symbol: "💎",
              japanese: "魂",
            },
            {
              icon: <PortalIcon size={32} />,
              title: "Any Chain",
              desc: "Base, Ethereum, Sui, and NEAR supported. More chains coming soon.",
              accent: "#a855f7",
              symbol: "🌀",
              japanese: "次元",
            },
            {
              icon: <CrownIcon size={32} />,
              title: "Community Takeover",
              desc: "The Guild votes on which dead collections to resurrect. Royalties flow back to holders. You decide what happens.",
              accent: "#ffd700",
              symbol: "👑",
              japanese: "王冠",
            },
            {
              icon: <SealIcon size={32} />,
              title: "Permanent Storage",
              desc: "Your reborn NFT lives on Arweave. Not a server. Not an S3 bucket. Permanent and immutable.",
              accent: "#ff6b35",
              symbol: "📜",
              japanese: "永劫",
            },
            {
              icon: <ScrollIcon size={32} open />,
              title: "Fully Open Source",
              desc: "Every line of code is on GitHub. Don't trust us. Verify it yourself.",
              accent: "#ff3366",
              symbol: "📖",
              japanese: "真理",
            },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="group relative"
            >
              {/* Glow backdrop on hover */}
              <div
                className="absolute -inset-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, ${feature.accent}11, transparent 60%, ${feature.accent}11)`,
                  filter: 'blur(15px)',
                }}
              />

              {/* Shrine tablet card */}
              <div
                className="relative p-5 h-full"
                style={{
                  background: 'linear-gradient(180deg, rgba(26, 16, 37, 0.9), rgba(13, 10, 26, 0.95))',
                  border: '1px solid #3a285066',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
                }}
              >
                {/* Top ornament */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-transparent via-sigil-border to-transparent" />
                
                {/* Side glyphs */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 font-pixel text-lg opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: feature.accent }}>
                  {feature.symbol}
                </div>

                <div className="flex items-start gap-4 pl-2">
                  {/* Icon container with shrine glow */}
                  <div
                    className="flex-shrink-0 w-14 h-14 flex items-center justify-center relative"
                    style={{
                      background: `${feature.accent}10`,
                      border: `1px solid ${feature.accent}33`,
                    }}
                  >
                    <div className="absolute inset-0" style={{
                      background: `radial-gradient(circle at center, ${feature.accent}22 0%, transparent 70%)`,
                    }} />
                    <div className="relative z-10">{feature.icon}</div>
                    
                    {/* Corner sparkles */}
                    <motion.div
                      className="absolute -top-1 -right-1 w-2 h-2"
                      style={{ background: feature.accent }}
                      animate={{ scale: [0.5, 1, 0.5], opacity: [0.3, 0.8, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Japanese kanji above title */}
                    <div className="font-jp text-xs mb-1" style={{ color: feature.accent }}>
                      {feature.japanese}
                    </div>
                    
                    <h3 className="font-pixel text-xs mb-2" style={{ color: feature.accent }}>
                      {feature.title}
                    </h3>
                    
                    <p className="font-silk text-[12px] text-spirit-silver leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                </div>

                {/* Bottom decoration */}
                <div className="absolute bottom-2 right-3 flex gap-1">
                  <span className="text-[8px]" style={{ color: feature.accent, opacity: 0.3 }}>◆</span>
                  <span className="text-[8px]" style={{ color: feature.accent, opacity: 0.5 }}>◆</span>
                  <span className="text-[8px]" style={{ color: feature.accent, opacity: 0.3 }}>◆</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
           SECTION 4 - SUPPORTED CHAINS (DIMENSIONAL RIFT PORTAL)
           ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-4 relative z-10 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, rgba(153, 69, 255, 0.06) 0%, transparent 60%)',
          }} />
        </div>

        {/* Portal divider */}
        <div className="relative max-w-2xl mx-auto mb-16">
          <div className="h-px bg-gradient-to-r from-transparent via-soul-cyan/50 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void-purple px-4 py-1">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="text-soul-cyan text-xl"
            >
              🌀
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-4"
        >
          <span className="font-pixel text-[9px] tracking-[0.4em] text-faded-spirit uppercase">Supported Chains</span>
          <div className="font-jp text-[10px] text-blood-pink/60 mt-1 tracking-wider">対応チェーン</div>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-pixel text-xl md:text-2xl text-center text-ghost-white mb-4"
        >
          Seal From Any Chain
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="font-silk text-sm text-faded-spirit text-center mb-12 max-w-md mx-auto"
        >
          One Solana wallet. That&apos;s all you need. We handle the rest.
        </motion.p>

        {/* CHAIN GRID - Clean, readable, works on all screens */}
        <div className="max-w-3xl mx-auto">
          {/* Supported source chains */}
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {[
              { name: "Base", abbr: "BASE", color: "#0052ff" },
              { name: "Ethereum", abbr: "ETH", color: "#627eea" },
              { name: "Sui", abbr: "SUI", color: "#4da2ff" },
              { name: "NEAR", abbr: "NEAR", color: "#00c1de" },
            ].map((chain, i) => (
              <motion.div
                key={chain.name}
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03, type: "spring", stiffness: 300 }}
                whileHover={{ scale: 1.08 }}
                className="flex items-center gap-2 px-3 py-2"
                style={{
                  background: `${chain.color}10`,
                  border: `1px solid ${chain.color}33`,
                }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: chain.color, boxShadow: `0 0 6px ${chain.color}66` }}
                />
                <span className="font-pixel text-[8px]" style={{ color: chain.color }}>{chain.abbr}</span>
              </motion.div>
            ))}
          </div>

          {/* Divider */}
          {/* Destination */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8 }}
            className="text-center"
          >
            <div
              className="inline-flex items-center gap-4 px-8 py-4"
              style={{
                border: '2px solid #9945ff44',
                background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.1), rgba(13, 10, 26, 0.8))',
                boxShadow: '0 0 30px rgba(153, 69, 255, 0.2)',
              }}
            >
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              >
                <SoulOrb size={24} />
              </motion.div>
              <div className="text-left">
                <span className="font-pixel text-[9px] text-faded-spirit block">Reborn on</span>
                <span className="font-pixel text-lg text-ghost-white flex items-center gap-2">
                  <span className="text-ritual-gold">SOLANA</span>
                  <span className="text-[10px]">✨</span>
                </span>
              </div>
              <motion.div
                animate={{ rotate: [0, -360] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              >
                <SoulOrb size={24} />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
           SECTION 5 - SECURITY & TRUST (SACRED PROTECTION)
           ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-4 relative z-10 overflow-hidden">
        {/* Deep security atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-void-purple via-void-black to-ritual-dark" />
        
        {/* Protective sigils - reduced */}
        <div className="absolute inset-0 pointer-events-none opacity-8">
          <div className="absolute top-12 left-8 font-pixel text-5xl text-spectral-green">⛧</div>
          <div className="absolute top-24 right-12 font-pixel text-3xl text-spectral-green">✧</div>
          <div className="absolute bottom-16 left-1/4 font-pixel text-4xl text-spectral-green">⛧</div>
        </div>

        {/* Sacred divider */}
        <div className="relative max-w-xl mx-auto mb-16">
          <div className="h-px bg-gradient-to-r from-transparent via-spectral-green/60 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void-purple px-4">
            <span className="text-spectral-green text-xl">🛡</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* MAIN SECURITY SEAL */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative p-10 mb-10"
            style={{
              background: 'linear-gradient(180deg, rgba(0, 255, 136, 0.05), rgba(13, 10, 26, 0.9))',
              border: '2px solid rgba(0, 255, 136, 0.25)',
              boxShadow: '0 0 60px rgba(0, 255, 136, 0.1), inset 0 0 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Corner protective runes */}
            <div className="absolute top-3 left-4 font-pixel text-lg text-spectral-green/40">◆</div>
            <div className="absolute top-3 right-4 font-pixel text-lg text-spectral-green/40">◆</div>
            <div className="absolute bottom-3 left-4 font-pixel text-lg text-spectral-green/40">◆</div>
            <div className="absolute bottom-3 right-4 font-pixel text-lg text-spectral-green/40">◆</div>

            {/* Center seal */}
            <motion.div
              className="w-24 h-24 mx-auto mb-6 relative"
              animate={{
                boxShadow: ['0 0 20px rgba(0, 255, 136, 0.3)', '0 0 40px rgba(0, 255, 136, 0.5)', '0 0 20px rgba(0, 255, 136, 0.3)'],
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="absolute inset-0 border-2 border-spectral-green/30 rounded-full" />
              <div className="absolute inset-2 border border-spectral-green/20 rounded-full" />
              <div className="absolute inset-4 border border-spectral-green/10 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl text-spectral-green">🛡</span>
              </div>
              
              {/* Rotating outer ring */}
              <motion.div
                className="absolute inset-[-8px]"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-spectral-green rounded-full" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-spectral-green rounded-full" />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-spectral-green rounded-full" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-spectral-green rounded-full" />
              </motion.div>
            </motion.div>

            <h2 className="font-pixel text-lg text-center text-spectral-green mb-2 flex items-center justify-center gap-3">
              <span className="text-spectral-green/50">✧</span>
              Security First
              <span className="text-spectral-green/50">✧</span>
            </h2>
            
            <p className="font-silk text-sm text-spectral-green/60 text-center mb-6">
              Your NFT is safe. Here&apos;s why.
            </p>

            {/* Three pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { 
                  label: "No Bridges", 
                  detail: "No multisigs, no wrapped tokens. Your NFT never leaves your control until rebirth.",
                  icon: "⛔",
                  japanese: "橋なし",
                },
                { 
                  label: "Open Source", 
                  detail: "Every line on GitHub. Audited by top firms. Verify everything yourself.",
                  icon: "📜",
                  japanese: "公開可能",
                },
                { 
                  label: "dWallet MPC", 
                  detail: "2PC-MPC cryptography. Distributed key generation. No single point of failure.",
                  icon: "🔐",
                  japanese: "分散鍵",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  whileHover={{ scale: 1.03 }}
                  className="text-center group"
                >
                  {/* Icon with glow */}
                  <motion.div
                    className="w-16 h-16 mx-auto mb-3 flex items-center justify-center relative"
                    style={{
                      background: 'rgba(0, 255, 136, 0.1)',
                      border: '1px solid rgba(0, 255, 136, 0.2)',
                    }}
                    whileHover={{ boxShadow: '0 0 20px rgba(0, 255, 136, 0.3)' }}
                  >
                    <span className="text-3xl">{item.icon}</span>
                    {/* Glow ring */}
                    <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{
                      background: 'radial-gradient(circle, rgba(0, 255, 136, 0.2) 0%, transparent 70%)',
                    }} />
                  </motion.div>
                  
                  {/* Japanese */}
                  <div className="font-jp text-xs text-spectral-green/50 mb-1">
                    {item.japanese}
                  </div>
                  
                  <h3 className="font-pixel text-xs text-spectral-green mb-2">{item.label}</h3>
                  <p className="font-silk text-[11px] text-spirit-silver leading-relaxed">
                    {item.detail}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Trust badges row */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-6"
          >
            {[
              { label: "Audited", color: "#00ff88" },
              { label: "Bug Bounty", color: "#00ccff" },
              { label: "Verified", color: "#ffd700" },
              { label: "Non-Custodial", color: "#a855f7" },
            ].map((badge, i) => (
              <motion.div
                key={badge.label}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 + i * 0.1 }}
                whileHover={{ scale: 1.1 }}
                className="flex items-center gap-2 px-4 py-2"
                style={{
                  background: `${badge.color}10`,
                  border: `1px solid ${badge.color}33`,
                }}
              >
                <span className="text-spectral-green">✓</span>
                <span className="font-pixel text-[9px]" style={{ color: badge.color }}>{badge.label}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
           SECTION 6 - DIALOGUE + FINAL CTA (SHRINE GATE)
           ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 px-4 relative z-10 overflow-hidden">
        {/* Portal to CTA atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-ritual-dark via-void-purple to-void-black" />
        
        {/* Gate-like decorations - simplified */}
        <div className="absolute left-0 top-0 bottom-0 w-20 pointer-events-none">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="absolute right-0 w-px"
              style={{
                top: `${i * 20 + 15}%`,
                height: '10%',
                background: `linear-gradient(to bottom, transparent, #ffd70033, transparent)`,
              }}
            />
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-20 pointer-events-none">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 w-px"
              style={{
                top: `${i * 20 + 15}%`,
                height: '10%',
                background: `linear-gradient(to bottom, transparent, #ffd70033, transparent)`,
              }}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="relative max-w-lg mx-auto mb-16">
          <div className="h-px bg-gradient-to-r from-transparent via-ritual-gold/60 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void-purple px-4">
            <span className="text-ritual-gold text-xl">⛩</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* GATEWAY DIALOGUE */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <DialogueBox
              speaker="Ika"
              portrait="smug"
              text="Your favorite collection is dead. The devs are gone. But that PFP is still you. Let's bring it back to life together~"
            />
          </motion.div>

          {/* FINAL CTA - Shrine gate button */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-center mt-14"
          >
            {/* Decorative frame around button */}
            <div className="relative inline-block">
              {/* Gate frame */}
              <div className="absolute -inset-6 pointer-events-none">
                <div className="absolute top-0 left-0 w-3 h-12 border-l-2 border-t-2 border-ritual-gold/40" />
                <div className="absolute top-0 right-0 w-3 h-12 border-r-2 border-t-2 border-ritual-gold/40" />
                <div className="absolute bottom-0 left-0 w-3 h-12 border-l-2 border-b-2 border-ritual-gold/40" />
                <div className="absolute bottom-0 right-0 w-3 h-12 border-r-2 border-b-2 border-ritual-gold/40" />
              </div>
              
              {/* Glow animation */}
              <motion.div
                className="absolute -inset-2 rounded-lg"
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(255, 51, 102, 0.2)',
                    '0 0 40px rgba(255, 51, 102, 0.4)',
                    '0 0 20px rgba(255, 51, 102, 0.2)',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />

              <Link href="/seal">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(255, 51, 102, 0.5)' }}
                  whileTap={{ scale: 0.98 }}
                  className="relative font-pixel text-sm md:text-base px-10 py-5 text-ghost-white"
                  style={{
                    background: 'linear-gradient(135deg, #ff3366, #cc1144, #ff3366)',
                    backgroundSize: '200% 200%',
                    border: '2px solid #ff336688',
                    boxShadow: '0 6px 0 #880022, 0 0 30px rgba(255, 51, 102, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.15)',
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                    animation: 'shimmer 3s ease infinite',
                  }}
                >
                  {/* Corner decorations */}
                  <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-ritual-gold/60" />
                  <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-ritual-gold/60" />
                  <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-ritual-gold/60" />
                  <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-ritual-gold/60" />
                  
                  <span className="relative z-10 flex items-center gap-3">
                    <span className="text-lg">⚔</span>
                    <span>Begin the Ritual</span>
                    <span className="text-lg">⚔</span>
                  </span>
                </motion.button>
              </Link>
            </div>

            {/* Instruction text */}
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="font-silk text-[11px] text-faded-spirit mt-6 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 flex-wrap"
            >
              <span>Connect your Solana wallet</span>
              <span className="hidden md:inline text-blood-pink/30">|</span>
              <span>Select a chain</span>
              <span className="hidden md:inline text-blood-pink/30">|</span>
              <span>Seal your NFT</span>
              <span className="hidden md:inline text-blood-pink/30">|</span>
              <span className="text-spectral-green">Done</span>
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
           FOOTER (ORNATE SHRINE BASE)
           ═══════════════════════════════════════════════════════════════════════ */}
      <footer className="py-12 md:py-16 px-4 relative z-10 overflow-hidden">
        {/* Footer atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-void-black to-void-purple" />
        
        {/* Decorative top border */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sigil-border to-transparent" />
        
        {/* Floating footer particles - reduced */}
        <div className="absolute inset-0 pointer-events-none opacity-25">
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute font-pixel text-xs"
              style={{
                left: `${15 + i * 16}%`,
                bottom: '100%',
                color: i % 2 === 0 ? '#ffd700' : '#ff3366',
              }}
              animate={{
                y: [0, -80],
                opacity: [0.3, 0],
              }}
              transition={{
                duration: 5 + i * 0.4,
                repeat: Infinity,
                delay: i * 0.6,
              }}
            >
              {["✦", "◆", "☆", "✧", "⚔"][i]}
            </motion.div>
          ))}
        </div>

        <div className="max-w-4xl mx-auto relative">
          {/* Main footer content */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10">
            {/* Logo with shrine frame */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center gap-4"
            >
              {/* Decorative frame */}
              <div className="relative">
                <div className="w-16 h-16 relative" style={{
                  border: '2px solid #ffd70044',
                  background: 'rgba(13, 10, 26, 0.8)',
                }}>
                  {/* Corner decorations */}
                  <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-ritual-gold" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 border-t border-r border-ritual-gold" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b border-l border-ritual-gold" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-ritual-gold" />
                  
                  <Image 
                    src="/art/ika-mascot-v2.png" 
                    alt="Ika" 
                    width={56} 
                    height={56} 
                    className="pixelated mx-auto mt-1"
                    style={{ imageRendering: 'pixelated' }} 
                  />
                </div>
              </div>
              
              <div>
                <h3 className="font-pixel text-sm text-ritual-gold flex items-center gap-2">
                  <span>イカ転生</span>
                  <span className="text-[10px] text-blood-pink">⚔</span>
                </h3>
                <p className="font-silk text-[10px] text-faded-spirit">Bring your NFTs back to life</p>
                <p className="font-jp text-[8px] text-faded-spirit/60 mt-1">NFT 転生 プロトコル</p>
              </div>
            </motion.div>

            {/* Navigation with hover effects */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap justify-center gap-4 md:gap-6"
            >
              {[
                { href: "https://github.com/Illuminfti/ika-tensei", label: "GitHub", color: "ghost-white" },
                { href: "/seal", label: "Seal", color: "blood-pink" },
                { href: "/gallery", label: "Gallery", color: "soul-cyan" },
                { href: "/guild", label: "Guild", color: "ritual-gold" },
                { href: "https://twitter.com", label: "Twitter", color: "ghost-white" },
              ].map((link, i) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                  rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  whileHover={{ y: -2, scale: 1.05 }}
                  className="relative font-pixel text-[9px] text-faded-spirit hover:text-ghost-white transition-colors"
                >
                  <span className={`hover:text-${link.color} transition-colors`}>{link.label}</span>
                  {/* Hover underline */}
                  <motion.div
                    className="absolute -bottom-1 left-0 h-px"
                    style={{ background: link.color === 'ghost-white' ? '#e8e0f0' : `var(--${link.color})` }}
                    initial={{ width: 0 }}
                    whileHover={{ width: '100%' }}
                    transition={{ duration: 0.2 }}
                  />
                </motion.a>
              ))}
            </motion.div>
          </div>

          {/* Divider with symbol */}
          <div className="relative mb-8">
            <div className="h-px bg-gradient-to-r from-transparent via-sigil-border to-transparent" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-void-purple px-3">
              <span className="font-pixel text-xs text-ritual-gold">⚜</span>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center">
            <p className="font-silk text-[10px] text-faded-spirit/60">
              Powered by IKA dWallet Network | Metaplex Core | Arweave
            </p>
            
            {/* Version and status */}
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-2 px-3 py-1"
                style={{ background: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.15)' }}
              >
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }}
                />
                <span className="font-pixel text-[8px] text-spectral-green">v1.0 LIVE</span>
              </motion.div>
              
              <span className="font-pixel text-[8px] text-faded-spirit/30">
                © 2026
              </span>
            </div>
          </div>

          {/* Japanese blessing */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="font-jp text-xs text-faded-spirit/30 text-center mt-6"
          >
            ご安全に --- Go Anzen Ni
          </motion.p>
        </div>
      </footer>
    </div>
  );
}
