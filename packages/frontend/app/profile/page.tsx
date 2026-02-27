"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useWalletStore } from "@/stores/wallet";
import { getRebornNfts } from "@/lib/api";
import { DialogueBox } from "@/components/ui/DialogueBox";

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

// ============================================================================
// RANK SYSTEM
// ============================================================================

const RANK_CONFIG = {
  wanderer: { title: "Wanderer", icon: "🌱", color: "text-faded-spirit", minReborn: 0 },
  initiate: { title: "Initiate", icon: "🔥", color: "text-ritual-gold", minReborn: 1 },
  adept: { title: "Adept", icon: "⚡", color: "text-soul-cyan", minReborn: 5 },
  master: { title: "Master", icon: "👑", color: "text-blood-pink", minReborn: 10 },
  grandmaster: { title: "Grandmaster", icon: "💎", color: "text-cursed-violet-bright", minReborn: 25 },
};

function getRank(rebornCount: number): keyof typeof RANK_CONFIG {
  if (rebornCount >= 25) return "grandmaster";
  if (rebornCount >= 10) return "master";
  if (rebornCount >= 5) return "adept";
  if (rebornCount >= 1) return "initiate";
  return "wanderer";
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

const CharacterFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative inline-block">
    <div className="absolute -inset-3 bg-gradient-to-br from-ritual-gold via-blood-pink to-ritual-gold rounded-lg opacity-80" />
    <div className="absolute -inset-2 bg-ritual-dark rounded-lg border-2 border-ritual-gold" />
    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-ritual-gold" />
    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-ritual-gold" />
    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-ritual-gold" />
    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-ritual-gold" />
    <div className="relative bg-ritual-dark border-2 border-ritual-gold/50 rounded p-2 m-1">
      {children}
    </div>
  </div>
);

const XPBar = ({ current, max, level }: { current: number; max: number; level: number }) => {
  const percentage = Math.min((current / max) * 100, 100);
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="font-pixel text-[9px] text-ritual-gold">LVL {level}</span>
        <span className="font-pixel text-[9px] text-faded-spirit">{current}/{max} XP</span>
      </div>
      <div className="h-3 bg-ritual-dark border border-ritual-gold/30 rounded overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, delay: 0.5 }}
          className="h-full bg-gradient-to-r from-blood-pink via-ritual-gold to-soul-cyan"
        />
      </div>
    </div>
  );
};

const RankBadge = ({ rank }: { rank: keyof typeof RANK_CONFIG }) => {
  const config = RANK_CONFIG[rank];
  return (
    <motion.div whileHover={{ scale: 1.1 }} className={`inline-flex items-center gap-1 px-2 py-1 ${config.color} bg-void-purple/50 border border-current/30`}>
      <span className="text-sm">{config.icon}</span>
      <span className="font-pixel text-[9px]">{config.title}</span>
    </motion.div>
  );
};

const SectionTitle = ({ children, icon }: { children: React.ReactNode; icon: string }) => (
  <h2 className="font-pixel text-[10px] text-ritual-gold mb-4 flex items-center gap-2">
    <span className="text-ritual-gold/50">{icon}</span>
    <span className="border-b border-ritual-gold/30 pb-1">{children}</span>
    <span className="text-ritual-gold/50">{icon.split("").reverse().join("")}</span>
  </h2>
);

const SectionContainer = ({ children, delay = 0, title, icon }: { children: React.ReactNode; delay?: number; title: string; icon: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="relative mb-6"
  >
    <div className="absolute -inset-1 border border-ritual-gold/20" />
    <div className="relative bg-ritual-dark/80 backdrop-blur-sm p-5 border border-ritual-gold/30">
      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-ritual-gold/50 to-transparent" />
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {children}
    </div>
  </motion.div>
);

function truncateAddress(addr: string, n = 6) {
  return addr.length > n * 2 + 3 ? `${addr.slice(0, n)}...${addr.slice(-n)}` : addr;
}

// ============================================================================
// JOURNAL ENTRY (for reborn NFTs)
// ============================================================================

const JournalEntry = ({ nft }: { nft: RebornNFT }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    className="relative p-3 bg-ritual-dark/50 border-l-2 border-ritual-gold/50 hover:border-ritual-gold transition-colors"
  >
    <div className="absolute inset-0 bg-gradient-to-r from-ritual-gold/5 to-transparent pointer-events-none" />
    <div className="flex justify-between items-start gap-2">
      <div className="flex items-center gap-3">
        {/* NFT thumbnail */}
        <div className="w-10 h-10 border border-ritual-gold/30 overflow-hidden flex-shrink-0">
          {nft.image ? (
            <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-void-purple/50 flex items-center justify-center">
              <span className="text-[8px] text-faded-spirit">?</span>
            </div>
          )}
        </div>
        <div>
          <div className="font-pixel text-[8px] text-soul-cyan mb-1">{nft.name}</div>
          <div className="font-silk text-[7px] text-faded-spirit">
            {nft.originalChain} #{nft.originalTokenId}
          </div>
          <div className="font-pixel text-[6px] text-ritual-gold/60 mt-1">
            {nft.rebornDate ? new Date(nft.rebornDate).toLocaleDateString() : ""}
          </div>
        </div>
      </div>
      <a
        href={`https://solscan.io/token/${nft.mint}?cluster=devnet`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-pixel text-[6px] text-blood-pink hover:text-blood-pink/70 border border-blood-pink/30 px-2 py-1 hover:bg-blood-pink/10 transition-colors flex-shrink-0"
      >
        [View]
      </a>
    </div>
  </motion.div>
);

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
        text="Connect your Solana wallet to view your profile..."
      />
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProfilePage() {
  const { connected, publicKey } = useWalletStore();
  const [nfts, setNfts] = useState<RebornNFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [connected, publicKey]);

  // Derived stats
  const stats = useMemo(() => {
    const chains = new Set(nfts.map(n => n.originalChain)).size;
    const collections = new Set(nfts.map(n => n.originalContract)).size;
    return {
      rebornCount: nfts.length,
      chains,
      collections,
      rank: getRank(nfts.length),
      level: Math.max(1, nfts.length),
      xp: nfts.length * 100,
      xpToNext: Math.max(nfts.length + 1, 5) * 100,
    };
  }, [nfts]);

  // Not connected
  if (!connected) {
    return (
      <div className="min-h-screen py-8 px-4 max-w-4xl mx-auto">
        <ConnectPrompt />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 max-w-4xl mx-auto">
      {/* Background texture */}
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMDAwIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20" />
      </div>

      <div className="relative z-10">
        {/* ================================================================= */}
        {/* PROFILE HEADER */}
        {/* ================================================================= */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Character Portrait */}
            <CharacterFrame>
              <div className="w-28 h-28 bg-gradient-to-br from-purple-900/50 to-pink-900/50 border border-ritual-gold/30 flex items-center justify-center">
                <Image src="/art/ika-mascot-v2.png" alt="Ika" width={80} height={80} className="pixelated" />
              </div>
            </CharacterFrame>

            {/* Character Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                <h1 className="font-pixel text-lg text-ghost-white">
                  {publicKey ? truncateAddress(publicKey, 4) : "Unknown"}
                </h1>
                <RankBadge rank={stats.rank} />
              </div>

              <p className="font-silk text-[9px] text-faded-spirit mb-3">
                Solana Wallet Connected
              </p>

              {/* XP Bar */}
              <div className="max-w-xs">
                <XPBar current={stats.xp} max={stats.xpToNext} level={stats.level} />
              </div>

              {/* Stats row */}
              <div className="flex justify-center md:justify-start gap-4 mt-3 font-pixel text-[7px]">
                <div className="text-faded-spirit">
                  <span className="text-soul-cyan">REBORN:</span> {stats.rebornCount}
                </div>
                <div className="text-faded-spirit">
                  <span className="text-blood-pink">CHAINS:</span> {stats.chains}
                </div>
                <div className="text-faded-spirit">
                  <span className="text-ritual-gold">COLLECTIONS:</span> {stats.collections}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ================================================================= */}
        {/* SOUL BOND - Connected Wallet */}
        {/* ================================================================= */}
        <SectionContainer delay={0.1} title="Soul Bond" icon="⚔">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-between p-3 border border-ritual-gold/30 bg-ritual-gold/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center border border-soul-cyan bg-soul-cyan/10">
                <span className="text-lg text-pink-400">◎</span>
              </div>
              <div>
                <div className="font-pixel text-[8px] text-ghost-white flex items-center gap-2">
                  SOL
                  <span className="text-[7px] text-soul-cyan">● Bound</span>
                </div>
                <div className="font-silk text-[7px] text-faded-spirit">
                  {publicKey ? truncateAddress(publicKey, 8) : "—"}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (publicKey) {
                  navigator.clipboard.writeText(publicKey);
                }
              }}
              className="font-pixel text-[6px] px-2 py-1 border border-soul-cyan/50 text-soul-cyan hover:bg-soul-cyan/10 transition-colors"
            >
              [Copy]
            </button>
          </motion.div>
        </SectionContainer>

        {/* ================================================================= */}
        {/* JOURNAL OF SOULS - Reborn NFTs */}
        {/* ================================================================= */}
        <SectionContainer delay={0.2} title="Journal of Souls" icon="📖">
          {loading ? (
            <div className="text-center py-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="inline-block text-ritual-gold text-lg mb-2"
              >
                ✦
              </motion.div>
              <p className="font-silk text-[9px] text-faded-spirit">Consulting the archives...</p>
            </div>
          ) : error ? (
            <div className="text-center py-6">
              <p className="font-silk text-[9px] text-blood-pink">{error}</p>
            </div>
          ) : nfts.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-silk text-[9px] text-faded-spirit mb-3">
                No reborn souls recorded yet. Begin your first ritual.
              </p>
              <Link
                href="/seal"
                className="font-pixel text-[8px] text-blood-pink hover:text-ghost-white transition-colors"
                style={{ textShadow: "0 0 8px rgba(220,20,60,0.5)" }}
              >
                → Begin the Seal Ritual ←
              </Link>
            </div>
          ) : (
            <div className="relative">
              {/* Book spine effect */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-ritual-gold/30 via-ritual-gold/10 to-ritual-gold/30" />

              <div className="pl-4 space-y-2">
                {nfts.map((nft, index) => (
                  <motion.div
                    key={nft.mint}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + index * 0.05 }}
                  >
                    <JournalEntry nft={nft} />
                  </motion.div>
                ))}
              </div>

              <div className="mt-4 text-center">
                <span className="font-pixel text-[6px] text-faded-spirit">
                  — ✦ {nfts.length} soul{nfts.length !== 1 ? "s" : ""} recorded ✦ —
                </span>
              </div>
            </div>
          )}
        </SectionContainer>

        {/* ================================================================= */}
        {/* QUICK ACTIONS */}
        {/* ================================================================= */}
        <SectionContainer delay={0.3} title="Quick Actions" icon="⚙">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/seal">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 border border-blood-pink/30 bg-blood-pink/5 text-center cursor-pointer hover:bg-blood-pink/10 transition-colors"
              >
                <span className="text-lg block mb-1">⛤</span>
                <span className="font-pixel text-[8px] text-ghost-white">Seal an NFT</span>
                <p className="font-silk text-[6px] text-faded-spirit mt-1">Begin the ritual</p>
              </motion.div>
            </Link>

            <Link href="/gallery">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 border border-soul-cyan/30 bg-soul-cyan/5 text-center cursor-pointer hover:bg-soul-cyan/10 transition-colors"
              >
                <span className="text-lg block mb-1">📖</span>
                <span className="font-pixel text-[8px] text-ghost-white">View Gallery</span>
                <p className="font-silk text-[6px] text-faded-spirit mt-1">Browse reborn NFTs</p>
              </motion.div>
            </Link>

            <Link href="/faucet">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 border border-ritual-gold/30 bg-ritual-gold/5 text-center cursor-pointer hover:bg-ritual-gold/10 transition-colors"
              >
                <span className="text-lg block mb-1">⚔</span>
                <span className="font-pixel text-[8px] text-ghost-white">Spirit Forge</span>
                <p className="font-silk text-[6px] text-faded-spirit mt-1">Get testnet tokens</p>
              </motion.div>
            </Link>
          </div>
        </SectionContainer>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center mt-8 pb-8"
        >
          <div className="font-pixel text-[7px] text-faded-spirit/50">
            ✦ Ika Tensei • The Reincarnation Ritual ✦
          </div>
        </motion.div>
      </div>
    </div>
  );
}
