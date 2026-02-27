"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import { PixelButton } from "@/components/ui/PixelButton";
import { BackgroundAtmosphere } from "@/components/ui/BackgroundAtmosphere";

// Floating kanji particles
const kanjiParticles = [
  "虚", "無", "空", "迷", "失", "魂", "闇", "異",
  "壊", "滅", "消", "逝", "奈", "落", "漂", "揺"
];

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background atmosphere */}
      <BackgroundAtmosphere mood="intense" />

      {/* Floating kanji particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {kanjiParticles.map((kanji, index) => (
          <motion.div
            key={index}
            className="absolute font-jp text-2xl text-blood-pink opacity-20"
            initial={{
              x: `${Math.random() * 100}%`,
              y: "110%",
              opacity: 0,
            }}
            animate={{
              y: [
                "110%",
                Math.random() * 60 - 30 + "%",
                Math.random() * 60 - 30 + "%",
                "-10%",
              ],
              opacity: [0, 0.3, 0.2, 0],
              rotate: [0, Math.random() * 360 - 180],
            }}
            transition={{
              duration: 8 + Math.random() * 4,
              delay: Math.random() * 5,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{
              left: `${(index / kanjiParticles.length) * 100}%`,
            }}
          >
            {kanji}
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8 text-center px-4">
        {/* IkaSprite with bobbing animation */}
        <motion.div
          animate={{
            y: [0, -15, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Image src="/art/ika-mascot-v2.png" alt="Ika" width={96} height={96} className="pixelated" />
        </motion.div>

        {/* 404 text with glitch effect */}
        <motion.h1
          className="font-pixel text-6xl text-blood-pink"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            textShadow: "0 0 20px rgba(255,51,102,0.5)",
          }}
        >
          404
        </motion.h1>

        {/* Title */}
        <motion.p
          className="font-pixel text-xl text-ritual-gold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Lost in the Void
        </motion.p>

        {/* Subtitle */}
        <motion.p
          className="font-silk text-faded-spirit text-sm max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          You&apos;ve wandered into the void between realms...
          <br />
          The spirits cannot find what you seek...
        </motion.p>

        {/* Dramatic effect elements */}
        <motion.div
          className="flex gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          {["◈", "◇", "◎", "◆", "◈"].map((symbol, i) => (
            <motion.span
              key={i}
              className="text-sigil-border text-lg"
              animate={{
                opacity: [0.3, 1, 0.3],
                y: [0, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
              }}
            >
              {symbol}
            </motion.span>
          ))}
        </motion.div>

        {/* Return button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <Link href="/">
            <PixelButton variant="primary" size="lg">
              ← Return to the Realm
            </PixelButton>
          </Link>
        </motion.div>

        {/* Optional: Quick links */}
        <motion.div
          className="flex gap-6 mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          <Link 
            href="/seal" 
            className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors font-mono"
          >
            [Seal Your NFT]
          </Link>
          <Link 
            href="/gallery" 
            className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors font-mono"
          >
            [Gallery]
          </Link>
          <Link 
            href="/guild" 
            className="text-[10px] text-gray-500 hover:text-purple-400 transition-colors font-mono"
          >
            [Guild]
          </Link>
        </motion.div>
      </div>

      {/* Bottom atmospheric effect */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-void-purple to-transparent pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      />
    </div>
  );
}
