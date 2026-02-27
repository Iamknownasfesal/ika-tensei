"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { SummoningCircle } from "@/components/ui/SummoningCircle";
import { DialogueBox } from "@/components/ui/DialogueBox";
import { PixelButton } from "@/components/ui/PixelButton";
import { useWalletStore } from "@/stores/wallet";
import { getRebornNfts } from "@/lib/api";

// ============================================================================
// TYPES
// ============================================================================

interface RebornNFT {
  mint: string;
  name: string;
  image: string;
  originalChain: string;
  originalContract: string;
  originalTokenId: string;
  sealHash: string;
  rebornDate: string;
}

const CHAIN_DISPLAY: Record<string, { color: string; icon: string }> = {
  "base-sepolia": { color: "#0052ff", icon: "⟐" },
  "ethereum-sepolia": { color: "#627eea", icon: "⟐" },
  base: { color: "#0052ff", icon: "⟐" },
  ethereum: { color: "#627eea", icon: "⟐" },
};

function getChainDisplay(chain: string) {
  return CHAIN_DISPLAY[chain.toLowerCase()] || { color: "#8b8b8b", icon: "◆" };
}

function truncateAddress(addr: string, n = 6) {
  return addr.length > n * 2 + 3 ? `${addr.slice(0, n)}...${addr.slice(-n)}` : addr;
}

function hashToColors(hash: string): [string, string] {
  let h = 0;
  for (let i = 0; i < hash.length; i++) h = ((h << 5) - h + hash.charCodeAt(i)) | 0;
  const hue1 = Math.abs(h % 360);
  const hue2 = (hue1 + 60 + Math.abs((h >> 8) % 120)) % 360;
  return [`hsl(${hue1}, 70%, 50%)`, `hsl(${hue2}, 60%, 40%)`];
}

// ============================================================================
// FLOATING PARTICLES
// ============================================================================

function FloatingParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 15,
      duration: 15 + Math.random() * 10,
      size: Math.random() > 0.7 ? 3 : 2,
      opacity: 0.1 + Math.random() * 0.3,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: "-20px",
            width: p.size,
            height: p.size,
            background: p.size > 2
              ? "radial-gradient(circle, #ffd700 0%, transparent 70%)"
              : "radial-gradient(circle, #8b7aac 0%, transparent 70%)",
            opacity: p.opacity,
          }}
          animate={{
            y: [-20, -1000],
            x: [0, Math.sin(p.id) * 50],
            opacity: [0, p.opacity, p.opacity, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// RESOLVE IMAGE — fetch actual image URL from Arweave/Irys metadata JSON
// ============================================================================

const imageCache = new Map<string, string>();

function useResolvedImage(url: string | undefined) {
  const [resolved, setResolved] = useState<string | undefined>(url);

  useEffect(() => {
    if (!url) return;

    // Already a direct image (not Irys/Arweave metadata JSON)
    const isMetadataUrl =
      (url.includes("irys.xyz/") || url.includes("arweave.net/")) &&
      !url.includes(".png") && !url.includes(".jpg") && !url.includes(".gif") && !url.includes(".webp") && !url.includes(".svg");

    if (!isMetadataUrl) {
      setResolved(url);
      return;
    }

    if (imageCache.has(url)) {
      setResolved(imageCache.get(url));
      return;
    }

    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.image) {
          imageCache.set(url, json.image);
          setResolved(json.image);
        }
      })
      .catch(() => {
        // Keep original URL as fallback
      });

    return () => { cancelled = true; };
  }, [url]);

  return resolved;
}

// ============================================================================
// CARD
// ============================================================================

function TarotCard({ nft, index, onClick }: { nft: RebornNFT; index: number; onClick: () => void }) {
  const chainDisplay = getChainDisplay(nft.originalChain);
  const [c1, c2] = hashToColors(nft.sealHash || nft.mint);
  const [isHovered, setIsHovered] = useState(false);
  const imageUrl = useResolvedImage(nft.image);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateY: -15 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ delay: index * 0.08, type: "spring", damping: 18, stiffness: 120 }}
      whileHover={{ y: -12, scale: 1.04, rotateY: 2 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="cursor-pointer perspective-1000"
    >
      <div
        className="relative overflow-hidden transition-all duration-500"
        style={{
          boxShadow: isHovered
            ? `0 0 40px ${chainDisplay.color}40, 0 0 80px ${chainDisplay.color}20, inset 0 0 30px ${chainDisplay.color}10`
            : `0 0 15px ${chainDisplay.color}20, 0 0 30px ${chainDisplay.color}10`,
        }}
      >
        {/* Card border */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            border: `2px solid ${chainDisplay.color}30`,
            background: `linear-gradient(135deg, ${chainDisplay.color}08 0%, transparent 50%, ${chainDisplay.color}08 100%)`,
          }}
        />

        {/* Corner runes */}
        <div className="absolute inset-0 z-25 pointer-events-none opacity-40">
          {["ᚠ", "ᚢ", "ᚦ", "ᚨ"].map((rune, i) => (
            <span
              key={i}
              className="absolute font-jp text-xs"
              style={{
                color: chainDisplay.color,
                top: i < 2 ? 4 : "auto",
                bottom: i >= 2 ? 4 : "auto",
                left: i % 2 === 0 ? 6 : "auto",
                right: i % 2 === 1 ? 6 : "auto",
              }}
            >
              {rune}
            </span>
          ))}
        </div>

        {/* Image area */}
        <div className="relative h-56 overflow-hidden" style={{ background: `linear-gradient(135deg, ${c1}15, ${c2}15)` }}>
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 30%, ${c1}33 0%, ${c2}15 40%, transparent 70%)`,
            }}
            animate={isHovered
              ? { scale: [1, 1.3, 1.1], opacity: [0.6, 0.9, 0.7] }
              : { scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }
            }
            transition={{ duration: 3, repeat: Infinity }}
          />

          {/* NFT image or fallback */}
          <div className="absolute inset-0 flex items-center justify-center">
            {imageUrl ? (
              <motion.img
                src={imageUrl}
                alt={nft.name}
                className="w-full h-full object-cover"
                style={{ opacity: isHovered ? 0.9 : 0.7 }}
                animate={isHovered ? { scale: 1.05 } : { scale: 1 }}
                transition={{ duration: 0.3 }}
              />
            ) : (
              <motion.div
                animate={isHovered
                  ? { rotate: [0, 8, -8, 0], scale: [1, 1.15, 1] }
                  : { rotate: [0, 3, -3, 0], scale: [1, 1.05, 1] }
                }
                transition={{ duration: isHovered ? 2 : 4, repeat: Infinity }}
              >
                <Image
                  src="/art/ika-mascot-v2.png"
                  alt=""
                  width={80}
                  height={80}
                  className="pixelated"
                  style={{ opacity: isHovered ? 0.7 : 0.4 }}
                />
              </motion.div>
            )}
          </div>

          {/* Reborn stamp */}
          <motion.div
            className="absolute top-3 right-3 z-20"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: index * 0.08 + 0.3, type: "spring" }}
          >
            <div
              className="bg-void-purple/80 backdrop-blur-sm border px-2.5 py-1"
              style={{ borderColor: chainDisplay.color, boxShadow: `0 0 10px ${chainDisplay.color}30` }}
            >
              <span className="font-pixel text-spectral-green text-[6px] tracking-widest">✦ REBORN</span>
            </div>
          </motion.div>

          {/* Chain badge */}
          <div className="absolute top-3 left-3 z-20">
            <div
              className="px-2 py-1 backdrop-blur-sm border font-pixel text-[7px]"
              style={{
                backgroundColor: `${chainDisplay.color}15`,
                borderColor: `${chainDisplay.color}40`,
                color: chainDisplay.color,
              }}
            >
              {chainDisplay.icon} {nft.originalChain}
            </div>
          </div>

          {/* Bottom glow line */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[3px]"
            style={{
              background: `linear-gradient(90deg, transparent, ${chainDisplay.color}, ${chainDisplay.color}, transparent)`,
              boxShadow: `0 0 10px ${chainDisplay.color}, 0 0 20px ${chainDisplay.color}50`,
            }}
          />
        </div>

        {/* Card info */}
        <div className="relative bg-void-purple/90 p-3.5 border-t" style={{ borderColor: `${chainDisplay.color}30` }}>
          <h3 className="font-pixel text-ghost-white text-[9px] mb-2 truncate" style={{ textShadow: "0 0 10px rgba(232,224,240,0.3)" }}>
            {nft.name}
          </h3>
          <div className="flex items-center justify-between">
            <span className="font-mono text-faded-spirit text-[8px]">
              {nft.rebornDate ? new Date(nft.rebornDate).toLocaleDateString() : ""}
            </span>
            <span className="font-pixel text-spectral-green text-[6px] tracking-wider">
              ✦ REBORN
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// STATS BAR
// ============================================================================

function StatsBar({ nfts }: { nfts: RebornNFT[] }) {
  const stats = useMemo(() => ({
    total: nfts.length,
    chains: new Set(nfts.map(n => n.originalChain)).size,
    collections: new Set(nfts.map(n => n.originalContract)).size,
  }), [nfts]);

  const statConfig = [
    { label: "REBORN", value: stats.total, icon: "✦", color: "#ff3366", subLabel: "神聖" },
    { label: "CHAINS", value: stats.chains, icon: "◆", color: "#ffd700", subLabel: "鎖" },
    { label: "COLLECTIONS", value: stats.collections, icon: "◈", color: "#00ccff", subLabel: "召喚" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="relative"
    >
      <div className="absolute inset-0 bg-void-purple/50 border border-sigil-border/30" style={{ transform: "scale(1.02)" }} />
      <div className="absolute inset-2 border border-ritual-gold/10" />
      <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 border-ritual-gold/40" />
      <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 border-ritual-gold/40" />
      <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 border-ritual-gold/40" />
      <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 border-ritual-gold/40" />

      <div className="relative flex flex-wrap gap-8 justify-center py-5 px-6">
        {statConfig.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + i * 0.1, type: "spring" }}
            className="text-center group"
          >
            <div className="relative">
              <div
                className="absolute inset-0 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-500"
                style={{ background: stat.color }}
              />
              <div className="relative font-pixel text-xl" style={{ color: stat.color }}>
                <span className="text-xs mr-1 opacity-70">{stat.icon}</span>
                {stat.value}
              </div>
            </div>
            <div className="font-pixel text-[6px] text-faded-spirit tracking-[0.2em] mt-1">{stat.label}</div>
            <div className="font-jp text-[8px] text-faded-spirit/50 mt-0.5">{stat.subLabel}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// DETAIL MODAL
// ============================================================================

function DetailModal({ nft, onClose }: { nft: RebornNFT; onClose: () => void }) {
  const chainDisplay = getChainDisplay(nft.originalChain);
  const [c1, c2] = hashToColors(nft.sealHash || nft.mint);
  const imageUrl = useResolvedImage(nft.image);

  const handleShare = () => {
    const text = `✦ ${nft.name} has been reborn on Solana!\n\nSealed from ${nft.originalChain} → Reborn via @IkaTensei\n\n#IkaTensei #NFTReborn`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-void-purple/95 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${chainDisplay.color}08 0%, transparent 60%)`,
        }}
      />

      <motion.div
        initial={{ scale: 0.8, y: 40, rotateX: -10 }}
        animate={{ scale: 1, y: 0, rotateX: 0 }}
        exit={{ scale: 0.8, y: 40, rotateX: -10 }}
        transition={{ type: "spring", damping: 20 }}
        onClick={e => e.stopPropagation()}
        className="relative bg-void-purple border max-w-lg w-full overflow-hidden"
        style={{
          borderColor: `${chainDisplay.color}30`,
          boxShadow: `0 0 60px ${chainDisplay.color}30, 0 0 120px ${chainDisplay.color}10`,
        }}
      >
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 z-10" style={{ borderColor: chainDisplay.color }} />
        <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 z-10" style={{ borderColor: chainDisplay.color }} />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 z-10" style={{ borderColor: chainDisplay.color }} />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 z-10" style={{ borderColor: chainDisplay.color }} />

        {/* Image area */}
        <div className="relative h-56" style={{ background: `linear-gradient(135deg, ${c1}20, ${c2}15)` }}>
          <div className="absolute inset-0 flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt={nft.name} className="w-full h-full object-cover" />
            ) : (
              <motion.div
                animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 6, repeat: Infinity }}
              >
                <Image src="/art/ika-mascot-v2.png" alt="" width={120} height={120} className="pixelated opacity-50" />
              </motion.div>
            )}
          </div>
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 70%, ${c1}30 0%, transparent 50%)` }}
          />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 font-pixel text-faded-spirit text-xs hover:text-ghost-white transition-colors z-10"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h2 className="font-pixel text-ghost-white text-sm mb-1" style={{ textShadow: "0 0 15px rgba(232,224,240,0.4)" }}>
            {nft.name}
          </h2>
          <div className="flex items-center gap-3 mb-6">
            <span
              className="font-pixel text-[7px] px-2.5 py-1 border"
              style={{ color: chainDisplay.color, borderColor: `${chainDisplay.color}44` }}
            >
              {chainDisplay.icon} {nft.originalChain}
            </span>
            <span className="font-mono text-faded-spirit text-[9px]">
              {nft.rebornDate ? new Date(nft.rebornDate).toLocaleDateString() : ""}
            </span>
            <span className="font-pixel text-spectral-green text-[7px]">✦ Reborn</span>
          </div>

          {/* Provenance chain */}
          <div
            className="relative bg-void-purple/80 border p-4 mb-6"
            style={{ borderColor: `${chainDisplay.color}30` }}
          >
            <div className="absolute -top-2 left-4 px-2 bg-void-purple">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#ffd700" }} />
                <span className="font-pixel text-ritual-gold text-[7px] tracking-wider">PROVENANCE CHAIN</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 p-3 border" style={{ borderColor: "#3a285050" }}>
                <p className="font-pixel text-faded-spirit text-[6px] mb-1">ORIGINAL</p>
                <p className="font-mono text-soul-cyan text-[8px]">{truncateAddress(nft.originalContract, 8)}</p>
                <p className="font-pixel text-[6px] mt-1" style={{ color: chainDisplay.color }}>
                  {nft.originalChain} #{nft.originalTokenId}
                </p>
              </div>

              <div className="text-ritual-gold text-lg font-pixel">→</div>

              <div className="flex-1 p-3 border" style={{ borderColor: "#3a285050" }}>
                <p className="font-pixel text-faded-spirit text-[6px] mb-1">REBORN ON SOLANA</p>
                <p className="font-mono text-spectral-green text-[8px]">{truncateAddress(nft.mint, 8)}</p>
                <p className="font-pixel text-[6px] text-spectral-green/60 mt-1">Metaplex Core</p>
              </div>
            </div>

            {nft.sealHash && (
              <div className="mt-3 pt-2 border-t" style={{ borderColor: "#3a285030" }}>
                <p className="font-pixel text-faded-spirit text-[6px] mb-1">SEAL HASH</p>
                <p className="font-mono text-ritual-gold/70 text-[7px]">{truncateAddress(nft.sealHash, 12)}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <PixelButton variant="primary" className="flex-1" onClick={handleShare}>
              Share on X
            </PixelButton>
            <PixelButton
              variant="dark"
              className="flex-1"
              onClick={() => window.open(`https://solscan.io/token/${nft.mint}?cluster=devnet`, "_blank")}
            >
              View on Solscan
            </PixelButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// CONNECT PROMPT
// ============================================================================

function ConnectPrompt() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-24"
    >
      <div className="relative inline-block mb-8">
        <div className="absolute inset-0 blur-3xl opacity-20 bg-void-indigo" />
        <motion.div
          animate={{ y: [0, -10, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          <Image
            src="/art/ika-mascot-v2.png"
            alt="Ika"
            width={140}
            height={140}
            className="pixelated relative z-10"
          />
        </motion.div>
      </div>

      <DialogueBox
        speaker="Ika"
        portrait="neutral"
        text="Connect your Solana wallet to view your reborn NFTs..."
      />
    </motion.div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GalleryPage() {
  const { connected, publicKey } = useWalletStore();
  const [nfts, setNfts] = useState<RebornNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [selectedNFT, setSelectedNFT] = useState<RebornNFT | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");

  // Fetch reborn NFTs when wallet connects
  useEffect(() => {
    if (!connected || !publicKey) {
      setNfts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getRebornNfts(publicKey)
      .then((data) => {
        if (!cancelled) setNfts(data.nfts);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load NFTs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [connected, publicKey]);

  const chains = ["All", ...Array.from(new Set(nfts.map(n => n.originalChain)))];

  const filteredNFTs = useMemo(() => {
    const list = filter === "All" ? [...nfts] : nfts.filter(n => n.originalChain === filter);
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => new Date(b.rebornDate).getTime() - new Date(a.rebornDate).getTime());
    }
    return list;
  }, [nfts, filter, sortBy]);

  return (
    <div className="min-h-screen bg-void-purple relative">
      <FloatingParticles />

      {/* Hero header */}
      <div className="relative overflow-hidden pb-10 pt-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-8">
            <SummoningCircle size={600} phase="idle" />
          </div>
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(255,51,102,0.08) 0%, transparent 50%, rgba(13,10,26,0.9) 100%)",
            }}
          />
        </div>

        <div className="relative z-10 text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1
              className="font-pixel text-ritual-gold text-2xl md:text-3xl mb-3"
              style={{
                textShadow: "0 0 30px rgba(255,215,0,0.6), 0 0 60px rgba(255,215,0,0.3), 0 4px 12px rgba(0,0,0,0.9)",
                letterSpacing: "0.1em",
              }}
            >
              ✦ 転生の書庫 ✦
            </h1>
            <p
              className="font-pixel text-blood-pink text-base md:text-lg mb-2"
              style={{ textShadow: "0 0 20px rgba(255,51,102,0.6), 0 2px 8px rgba(0,0,0,0.9)" }}
            >
              REBORN GALLERY
            </p>
            <p className="font-jp text-xs text-faded-spirit/70 mb-3">再生された NFT の 保存庫</p>
            <p
              className="font-silk text-ghost-white/70 text-xs max-w-lg mx-auto leading-relaxed"
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}
            >
              Your sealed and reincarnated NFTs, preserved forever on the blockchain
            </p>
          </motion.div>
        </div>

        {/* Stats — only show when we have NFTs */}
        {nfts.length > 0 && (
          <div className="relative z-10 mt-10 max-w-2xl mx-auto px-4">
            <StatsBar nfts={nfts} />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        {/* Not connected */}
        {!connected ? (
          <ConnectPrompt />
        ) : loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="inline-block text-ritual-gold text-2xl mb-4"
            >
              ✦
            </motion.div>
            <p className="font-silk text-faded-spirit text-sm">Loading your artifacts...</p>
          </motion.div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <DialogueBox
              speaker="Ika"
              portrait="worried"
              text={`The spirits couldn't retrieve your NFTs: ${error}`}
            />
          </motion.div>
        ) : nfts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 blur-3xl opacity-20 bg-void-indigo" />
              <motion.div
                animate={{ y: [0, -10, 0], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Image
                  src="/art/ika-mascot-v2.png"
                  alt="Ika"
                  width={140}
                  height={140}
                  className="pixelated relative z-10"
                />
              </motion.div>
              <div className="absolute inset-0 -z-10 border border-faded-spirit/10 rounded-full animate-pulse" style={{ transform: "scale(1.3)" }} />
            </div>

            <DialogueBox
              speaker="Ika"
              portrait="worried"
              text="No reborn NFTs here yet... The shrine awaits its first artifact. Begin the ritual to seal your first NFT!"
            />

            <Link href="/seal" className="inline-block mt-8">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <PixelButton variant="primary">✦ Begin the Ritual</PixelButton>
              </motion.div>
            </Link>
          </motion.div>
        ) : (
          <>
            {/* Filter + Sort bar */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap items-center justify-between gap-4 mb-10 p-4 border border-sigil-border/30 bg-void-purple/50"
            >
              <div className="flex flex-wrap gap-2">
                <span className="font-pixel text-[7px] text-faded-spirit/50 mr-2 self-center">FILTER:</span>
                {chains.map(chain => (
                  <button
                    key={chain}
                    onClick={() => setFilter(chain)}
                    className={`font-pixel text-[8px] px-4 py-2 border transition-all duration-300 ${
                      filter === chain
                        ? "border-ritual-gold/60 bg-ritual-gold/10 text-ritual-gold"
                        : "border-faded-spirit/20 text-faded-spirit/60 hover:border-faded-spirit/40 hover:text-faded-spirit"
                    }`}
                  >
                    {chain === "All" ? "◆ ALL" : `⟐ ${chain.toUpperCase()}`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 border border-faded-spirit/20 p-1">
                <span className="font-pixel text-[6px] text-faded-spirit/40 px-2">SORT:</span>
                <button
                  onClick={() => setSortBy("date")}
                  className={`font-pixel text-[7px] px-3 py-1.5 transition-all ${
                    sortBy === "date"
                      ? "bg-void-purple text-ritual-gold border border-ritual-gold/30"
                      : "text-faded-spirit/40 hover:text-faded-spirit"
                  }`}
                >
                  ↓ RECENT
                </button>
                <button
                  onClick={() => setSortBy("name")}
                  className={`font-pixel text-[7px] px-3 py-1.5 transition-all ${
                    sortBy === "name"
                      ? "bg-void-purple text-ritual-gold border border-ritual-gold/30"
                      : "text-faded-spirit/40 hover:text-faded-spirit"
                  }`}
                >
                  A-Z NAME
                </button>
              </div>
            </motion.div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredNFTs.map((nft, i) => (
                <TarotCard key={nft.mint} nft={nft} index={i} onClick={() => setSelectedNFT(nft)} />
              ))}
            </div>

            {/* Bottom CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-center mt-16"
            >
              <Link href="/seal">
                <PixelButton variant="dark" size="sm">✦ Seal Another NFT</PixelButton>
              </Link>
            </motion.div>
          </>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedNFT && <DetailModal nft={selectedNFT} onClose={() => setSelectedNFT(null)} />}
      </AnimatePresence>
    </div>
  );
}
