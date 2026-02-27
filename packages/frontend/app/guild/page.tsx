"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import dynamic from "next/dynamic";
import { DYNAMIC_ENV_ID } from "@/lib/constants";
import { BackgroundAtmosphere } from "@/components/ui/BackgroundAtmosphere";
import { DialogueBox } from "@/components/ui/DialogueBox";
import { SummoningCircle } from "@/components/ui/SummoningCircle";
import { useGuildRealms, useGuildProposals, useGuildTreasury, useGuildStats } from "@/hooks/useGuild";
import type { GuildRealm, GuildProposal } from "@/lib/api";

// Dynamic import to avoid SSR issues with useDynamicContext
const WalletBridge = dynamic(
  () => import("@/components/guild/WalletBridge").then((m) => m.WalletBridge),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type GuildTab = "hall" | "vault" | "council";

// SPL Governance proposal states
const PROPOSAL_STATE_NAMES: Record<number, string> = {
  0: "Draft",
  1: "Signing Off",
  2: "Voting",
  3: "Succeeded",
  4: "Executing",
  5: "Completed",
  6: "Cancelled",
  7: "Defeated",
  8: "Executing w/ Errors",
};

function getProposalStatusStyle(state: number): { label: string; color: string; bg: string } {
  switch (state) {
    case 2: return { label: "Voting", color: "#ffd700", bg: "rgba(255, 215, 0, 0.15)" };
    case 3: case 4: case 5: return { label: PROPOSAL_STATE_NAMES[state] || "Passed", color: "#00ff88", bg: "rgba(0, 255, 136, 0.15)" };
    case 6: case 7: return { label: PROPOSAL_STATE_NAMES[state] || "Defeated", color: "#ff3366", bg: "rgba(255, 51, 102, 0.15)" };
    default: return { label: PROPOSAL_STATE_NAMES[state] || "Pending", color: "#8a7a9a", bg: "rgba(138, 122, 154, 0.15)" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI COMPONENTS (pixel art theme)
// ═══════════════════════════════════════════════════════════════════════════════

const GuildCrest = () => (
  <div className="mx-auto mb-4 w-28 h-28 md:w-36 md:h-36 relative">
    <Image src="/art/guild-banner.png" alt="Guild" fill className="object-contain pixelated" />
  </div>
);

const CoinStack = ({ count }: { count: number }) => (
  <div className="flex items-end justify-center gap-1 h-12">
    {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ scale: 0, y: -20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: i * 0.1, type: "spring" }}
        className="w-6 h-3 bg-ritual-gold border-2 border-yellow-600 rounded-full relative"
        style={{ marginBottom: i * 2 }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] text-yellow-800 font-bold">$</span>
        </div>
      </motion.div>
    ))}
  </div>
);

const TreasureChest = () => (
  <div className="relative w-24 h-20 mx-auto">
    <div className="absolute bottom-0 w-24 h-14 bg-amber-900 border-4 border-amber-700 rounded-b-lg">
      <div className="absolute top-2 left-2 right-2 h-2 bg-amber-600"/>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-5 bg-yellow-500 border-2 border-yellow-700 rounded">
        <div className="w-2 h-3 bg-yellow-700 mx-auto mt-0.5"/>
      </div>
    </div>
    <div className="absolute bottom-12 w-24 h-8 bg-amber-800 border-4 border-amber-600 rounded-t-lg">
      <div className="absolute top-1 left-2 right-2 h-1 bg-amber-700"/>
    </div>
    <motion.div
      animate={{ rotateX: [0, -30] }}
      transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
      className="absolute -top-4 left-2 right-2 h-6 bg-amber-700 rounded-t-xl origin-bottom"
    />
  </div>
);

const WaxSeal = ({ state }: { state: number }) => {
  const isVoting = state === 2;
  const isPassed = [3, 4, 5].includes(state);
  const sealColor = isPassed ? "#8b0000" : isVoting ? "#b8860b" : "#2f2f2f";
  return (
    <div className="relative w-12 h-12">
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <circle cx="20" cy="20" r="18" fill={sealColor} stroke="#333" strokeWidth="2"/>
        <circle cx="20" cy="20" r="12" fill={sealColor} opacity={0.7}/>
        <path d="M20 8 L22 15 L28 12 L24 18 L30 20 L24 22 L28 28 L22 25 L20 32 L18 25 L12 28 L16 22 L10 20 L16 18 L12 12 L18 15 Z" fill="#8b0000" opacity={0.5}/>
        <text x="20" y="24" textAnchor="middle" fill="#c9a227" fontSize="10" fontWeight="bold">
          {isPassed ? "\u2713" : isVoting ? "\u23F3" : "\u2717"}
        </text>
      </svg>
    </div>
  );
};

const WoodenSign = ({ active, onClick, label, icon, count }: { active: boolean; onClick: () => void; label: string; icon: string; count?: number }) => (
  <motion.button
    whileHover={{ scale: 1.05, y: -2 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`
      relative px-4 py-2 font-pixel text-[9px] transition-all
      ${active
        ? "bg-amber-800 text-ritual-gold shadow-[0_4px_0_rgb(120,70,20),0_6px_12px_rgba(0,0,0,0.4)]"
        : "bg-amber-900 text-faded-spirit hover:bg-amber-800"
      }
    `}
    style={{
      clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)",
    }}
  >
    <span className="mr-1">{icon}</span>
    {label}
    {count !== undefined && count > 0 && (
      <span className="ml-2 px-1.5 py-0.5 text-[7px] bg-amber-950 rounded">{count}</span>
    )}
  </motion.button>
);

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative p-5 ${className}`}
      style={{
        background: "rgba(13, 10, 26, 0.85)",
        border: "1px solid #3a285066",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-ritual-gold/40" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-ritual-gold/40" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-ritual-gold/40" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-ritual-gold/40" />
      {children}
    </div>
  );
}

// Proposal Card (parchment style)
const ProposalCard = ({
  proposal,
  onVote,
  isVoting,
}: {
  proposal: GuildProposal;
  onVote: (proposal: GuildProposal) => void;
  isVoting: boolean;
}) => {
  const status = getProposalStatusStyle(proposal.state);
  const yesVotes = Number(proposal.yesVotes) || 0;
  const noVotes = Number(proposal.noVotes) || 0;
  const totalVotes = yesVotes + noVotes;
  const yesPercent = totalVotes > 0 ? Math.round((yesVotes * 100) / totalVotes) : 0;

  return (
    <motion.div whileHover={{ scale: 1.01 }} className="relative">
      <div className="absolute inset-0 bg-stone-800 rounded transform rotate-1 translate-x-1"/>
      <div className="absolute inset-0 bg-stone-700 rounded transform -rotate-1 -translate-x-1"/>

      <div className="relative p-5 bg-[#f4e4bc] rounded">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="font-pixel text-[9px] px-2 py-0.5"
                style={{ background: status.bg, color: status.color, border: `1px solid ${status.color}33` }}
              >
                {status.label.toUpperCase()}
              </span>
            </div>
            <h3 className="font-pixel text-[11px] text-stone-900 leading-tight">
              {proposal.name}
            </h3>
          </div>
          <WaxSeal state={proposal.state} />
        </div>

        {proposal.description && (
          <p className="font-serif text-[9px] text-stone-700 mb-3 italic border-l-2 border-stone-400 pl-2">
            {proposal.description}
          </p>
        )}

        <div className="flex gap-3 mb-3 font-pixel text-[9px]">
          <div className="flex-1 bg-stone-200 p-2 rounded text-center">
            <span className="text-spectral-green">For</span>
            <div className="text-stone-900">{formatVotes(proposal.yesVotes)}</div>
          </div>
          <div className="flex-1 bg-stone-200 p-2 rounded text-center">
            <span className="text-blood-pink">Against</span>
            <div className="text-stone-900">{formatVotes(proposal.noVotes)}</div>
          </div>
        </div>

        {totalVotes > 0 && (
          <div className="mb-3">
            <div className="h-2 bg-stone-300 rounded-full overflow-hidden border border-stone-500">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${yesPercent}%` }}
                transition={{ duration: 1, delay: 0.3 }}
                className="h-full bg-spectral-green"
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-pixel text-[7px] text-stone-600">{yesPercent}% For</span>
              <span className="font-pixel text-[7px] text-stone-600">{100 - yesPercent}% Against</span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="font-silk text-[10px] text-stone-600">
            {proposal.votingAt ? `Started ${new Date(proposal.votingAt * 1000).toLocaleDateString()}` : ""}
          </span>

          {proposal.state === 2 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onVote(proposal)}
              disabled={isVoting}
              className="relative px-4 py-2 bg-amber-700 text-ritual-gold font-pixel text-[9px] rounded border-2 border-amber-500 shadow-[2px_2px_0_#5c4020] disabled:opacity-50"
            >
              <span className="mr-1">{isVoting ? "..." : "\uD83E\uDE78"}</span>
              {isVoting ? "SIGNING..." : "CAST VOTE"}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Vote modal
const VoteCeremonyModal = ({
  isOpen,
  proposal,
  onVote,
  onClose,
  isSubmitting,
}: {
  isOpen: boolean;
  proposal: GuildProposal | null;
  onVote: (choice: "yes" | "no" | "abstain") => void;
  onClose: () => void;
  isSubmitting: boolean;
}) => (
  <AnimatePresence>
    {isOpen && proposal && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#1a1a2e] border-4 border-ritual-gold rounded-lg p-6 max-w-md w-full"
        >
          <div className="text-center mb-6">
            <h3 className="font-pixel text-sm text-ritual-gold mb-2">CAST YOUR VOTE</h3>
            <p className="font-serif text-xs text-faded-spirit italic">
              {proposal.name}
            </p>
          </div>

          {isSubmitting ? (
            <div className="text-center py-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-8 h-8 border-2 border-ritual-gold border-t-transparent rounded-full mx-auto mb-4"
              />
              <p className="font-pixel text-[10px] text-ritual-gold">Signing transaction...</p>
              <p className="font-silk text-[9px] text-faded-spirit mt-1">Check your wallet</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              <motion.button
                whileHover={{ scale: 1.02, x: 10 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onVote("yes")}
                className="w-full p-3 bg-spectral-green/20 border-2 border-spectral-green rounded-lg flex items-center gap-3 group"
              >
                <div className="w-10 h-10 bg-spectral-green rounded-full flex items-center justify-center">
                  <span className="text-xl">{"\u2694\uFE0F"}</span>
                </div>
                <div className="text-left">
                  <div className="font-pixel text-[10px] text-spectral-green">FORGE AHEAD</div>
                  <div className="font-silk text-[9px] text-faded-spirit">Vote in favor</div>
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02, x: 10 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onVote("no")}
                className="w-full p-3 bg-blood-pink/20 border-2 border-blood-pink rounded-lg flex items-center gap-3 group"
              >
                <div className="w-10 h-10 bg-blood-pink rounded-full flex items-center justify-center">
                  <span className="text-xl">{"\uD83D\uDEE1\uFE0F"}</span>
                </div>
                <div className="text-left">
                  <div className="font-pixel text-[10px] text-blood-pink">STAND GROUND</div>
                  <div className="font-silk text-[9px] text-faded-spirit">Vote against</div>
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02, x: 10 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onVote("abstain")}
                className="w-full p-3 bg-faded-spirit/20 border-2 border-faded-spirit rounded-lg flex items-center gap-3 group"
              >
                <div className="w-10 h-10 bg-faded-spirit rounded-full flex items-center justify-center">
                  <span className="text-xl">{"\uD83C\uDFF3\uFE0F"}</span>
                </div>
                <div className="text-left">
                  <div className="font-pixel text-[10px] text-faded-spirit">RAISE THE FLAG</div>
                  <div className="font-silk text-[9px] text-faded-spirit">Abstain from decision</div>
                </div>
              </motion.button>
            </div>
          )}

          {!isSubmitting && (
            <button
              onClick={onClose}
              className="w-full py-2 font-silk text-[9px] text-faded-spirit hover:text-ghost-white"
            >
              Cancel
            </button>
          )}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Realm selector
const RealmSelector = ({
  realms,
  selected,
  onSelect,
}: {
  realms: GuildRealm[];
  selected: string | null;
  onSelect: (addr: string) => void;
}) => {
  if (realms.length <= 1) return null;
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {realms.map((r) => (
        <motion.button
          key={r.realm_address}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(r.realm_address)}
          className={`px-3 py-1.5 font-pixel text-[8px] border transition-all ${
            selected === r.realm_address
              ? "bg-ritual-gold/20 border-ritual-gold text-ritual-gold"
              : "bg-void-purple/30 border-faded-spirit/30 text-faded-spirit hover:border-ritual-gold/50"
          }`}
        >
          {r.collection_name}
        </motion.button>
      ))}
    </div>
  );
};

// Loading spinner
const LoadingSpinner = ({ text }: { text: string }) => (
  <div className="text-center py-12">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
      className="w-8 h-8 border-2 border-ritual-gold/30 border-t-ritual-gold rounded-full mx-auto mb-4"
    />
    <p className="font-pixel text-[9px] text-faded-spirit">{text}</p>
  </div>
);

// Empty state
const EmptyState = ({ icon, text, subtext }: { icon: string; text: string; subtext?: string }) => (
  <div className="text-center py-12">
    <div className="text-4xl mb-4">{icon}</div>
    <p className="font-pixel text-[10px] text-faded-spirit mb-1">{text}</p>
    {subtext && <p className="font-silk text-[9px] text-faded-spirit/60">{subtext}</p>}
  </div>
);

// Helper to format large vote numbers
function formatVotes(votes: string): string {
  const n = Number(votes) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function GuildPage() {
  const [activeTab, setActiveTab] = useState<GuildTab>("hall");
  const [selectedRealm, setSelectedRealm] = useState<string | null>(null);
  const [votingProposal, setVotingProposal] = useState<GuildProposal | null>(null);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null);
  // Wallet state managed externally for SSR safety
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Data hooks
  const { data: realmsData, isLoading: realmsLoading } = useGuildRealms();
  const { data: statsData, isLoading: statsLoading } = useGuildStats();
  const { data: proposalsData, isLoading: proposalsLoading } = useGuildProposals(selectedRealm);
  const { data: treasuryData, isLoading: treasuryLoading } = useGuildTreasury(selectedRealm);

  const isWalletConnected = !!walletAddress;

  const realms = realmsData?.realms ?? [];

  // Auto-select first realm when loaded
  if (realms.length > 0 && !selectedRealm) {
    setSelectedRealm(realms[0].realm_address);
  }

  const selectedRealmData = realms.find(r => r.realm_address === selectedRealm);

  // Vote handler ref — set by WalletBridge when wallet connects
  const voteHandlerRef = useRef<((choice: "yes" | "no" | "abstain") => Promise<void>) | null>(null);

  const handleVote = useCallback(async (choice: "yes" | "no" | "abstain") => {
    if (!voteHandlerRef.current) {
      setVoteError("Wallet not connected");
      return;
    }
    setIsSubmittingVote(true);
    setVoteError(null);
    try {
      await voteHandlerRef.current(choice);
      setVoteSuccess(`Vote cast successfully!`);
      setVotingProposal(null);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Failed to cast vote");
    } finally {
      setIsSubmittingVote(false);
    }
  }, []);

  const proposals = proposalsData?.proposals ?? [];
  const activeProposalCount = proposals.filter(p => p.state === 2).length;

  return (
    <div className="min-h-screen relative">
      <BackgroundAtmosphere mood="mystical" />

      {/* ─── GUILD HEADER ────────────────────────────────────────────────── */}
      <section className="relative pt-8 pb-6 px-4 overflow-hidden">
        {/* Torch light ambient effects */}
        <div className="absolute top-20 left-10 pointer-events-none">
          <motion.div
            animate={{
              opacity: [0.6, 0.9, 0.6],
              boxShadow: ['0 0 30px #ff6b35', '0 0 50px #ff6b35', '0 0 30px #ff6b35'],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-4 h-40 bg-gradient-to-b from-amber-600/20 to-transparent"
            style={{ filter: 'blur(8px)' }}
          />
        </div>
        <div className="absolute top-20 right-10 pointer-events-none">
          <motion.div
            animate={{
              opacity: [0.5, 0.8, 0.5],
              boxShadow: ['0 0 30px #ff6b35', '0 0 50px #ff6b35', '0 0 30px #ff6b35'],
            }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
            className="w-4 h-40 bg-gradient-to-b from-amber-600/20 to-transparent"
            style={{ filter: 'blur(8px)' }}
          />
        </div>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-10">
          <SummoningCircle size={400} phase="idle" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center mb-6"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="mb-3"
              style={{ filter: "drop-shadow(0 4px 16px rgba(255, 215, 0, 0.3))" }}
            >
              <GuildCrest />
            </motion.div>

            <h1 className="font-pixel text-xl md:text-2xl text-ritual-gold text-glow-gold mb-1">
              {"\u5192\u96BA\u8005\u30AE\u30EB\u30C9"}
            </h1>
            <p className="font-pixel text-[8px] tracking-[0.3em] text-faded-spirit mb-4">
              ADVENTURER&apos;S GUILD
            </p>
            <p className="font-jp text-[10px] text-blood-pink/60 mb-4 tracking-wider">
              {"\u5192\u96BA\u8005 \u306E \u96C6\u3044"}
            </p>
          </motion.div>

          {/* Quick Stats Row (real data) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap justify-center gap-4 md:gap-8 mb-6"
          >
            {statsLoading ? (
              <p className="font-pixel text-[8px] text-faded-spirit">Loading stats...</p>
            ) : (
              [
                { label: "NFTs Sealed", value: statsData?.totalSealed.toLocaleString() ?? "0", color: "#ff3366" },
                { label: "Realms", value: statsData?.realmCount.toString() ?? "0", color: "#ffd700" },
                { label: "Collections", value: statsData?.collectionCount.toString() ?? "0", color: "#00ccff" },
                { label: "Treasury", value: `${(statsData?.totalTreasurySol ?? 0).toFixed(2)} SOL`, color: "#00ff88" },
              ].map((stat, i) => (
                <div key={stat.label} className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.1, type: "spring" }}
                    className="font-pixel text-base md:text-lg"
                    style={{ color: stat.color }}
                  >
                    {stat.value}
                  </motion.div>
                  <div className="font-pixel text-[6px] text-faded-spirit uppercase tracking-wider">{stat.label}</div>
                </div>
              ))
            )}
          </motion.div>
        </div>
      </section>

      {/* ─── TAB NAVIGATION ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(13, 10, 26, 0.95)", borderBottom: "1px solid #3a285033", backdropFilter: "blur(12px)" }}>
        <div className="max-w-5xl mx-auto flex gap-2 overflow-x-auto scrollbar-hide justify-center flex-wrap">
          <WoodenSign icon={"\uD83C\uDFF0"} label="Hall" active={activeTab === "hall"} onClick={() => setActiveTab("hall")} />
          <WoodenSign icon={"\uD83D\uDCB0"} label="Vault" active={activeTab === "vault"} onClick={() => setActiveTab("vault")} />
          <WoodenSign icon={"\uD83D\uDCDC"} label="Council" active={activeTab === "council"} onClick={() => setActiveTab("council")} count={activeProposalCount} />
        </div>
      </div>

      {/* ─── TAB CONTENT ──────────────────────────────────────────────────── */}
      <div className="px-4 py-8 relative z-10">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">

            {/* ═══ HALL TAB ═══ */}
            {activeTab === "hall" && (
              <motion.div
                key="hall"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <DialogueBox
                  speaker="Guild Master"
                  portrait="neutral"
                  text="Welcome to the Adventurer's Guild, traveler. Each reborn collection gets its own Realm, powered by SPL Governance. Trading royalties flow into the treasury automatically. Council members decide how funds get spent."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ y: -4, boxShadow: "0 0 20px rgba(255, 215, 0, 0.1)" }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setActiveTab("council")}
                    className="p-4 text-center transition-all"
                    style={{ background: "rgba(13, 10, 26, 0.7)", border: "1px solid #3a285066" }}
                  >
                    <div className="text-2xl mb-2">{"\uD83D\uDCDC"}</div>
                    <div className="font-pixel text-[9px] text-ghost-white mb-1">Vote Now</div>
                    <div className="font-silk text-[9px] text-faded-spirit">Active proposals await</div>
                  </motion.button>
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ y: -4, boxShadow: "0 0 20px rgba(255, 215, 0, 0.1)" }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setActiveTab("vault")}
                    className="p-4 text-center transition-all"
                    style={{ background: "rgba(13, 10, 26, 0.7)", border: "1px solid #3a285066" }}
                  >
                    <div className="text-2xl mb-2">{"\uD83D\uDCB0"}</div>
                    <div className="font-pixel text-[9px] text-ghost-white mb-1">View Vault</div>
                    <div className="font-silk text-[9px] text-faded-spirit">Guild treasury status</div>
                  </motion.button>
                </div>

                {/* Realm List */}
                <Panel>
                  <h3 className="font-pixel text-[9px] text-ritual-gold mb-4">DAO Realms</h3>
                  {realmsLoading ? (
                    <LoadingSpinner text="Loading realms..." />
                  ) : realms.length === 0 ? (
                    <EmptyState
                      icon={"\uD83C\uDFF0"}
                      text="No realms yet"
                      subtext="Realms are created automatically when new collections are bridged"
                    />
                  ) : (
                    <div className="space-y-2">
                      {realms.map((realm, i) => (
                        <motion.div
                          key={realm.realm_address}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.08 }}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-ritual-gold/5 transition-colors cursor-pointer"
                          style={{ border: "1px solid #3a285033" }}
                          onClick={() => {
                            setSelectedRealm(realm.realm_address);
                            setActiveTab("council");
                          }}
                        >
                          <div className="w-2 h-2 rounded-full bg-ritual-gold flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-pixel text-[9px] text-ghost-white truncate">{realm.realm_name}</p>
                            <p className="font-mono text-[7px] text-faded-spirit truncate">{realm.realm_address}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-pixel text-[8px] text-spectral-green">
                              {realm.collection_asset ? "Configured" : "Pending"}
                            </p>
                            <p className="font-pixel text-[6px] text-faded-spirit">
                              {new Date(realm.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </Panel>
              </motion.div>
            )}

            {/* ═══ VAULT TAB ═══ */}
            {activeTab === "vault" && (
              <motion.div
                key="vault"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <RealmSelector realms={realms} selected={selectedRealm} onSelect={setSelectedRealm} />

                <Panel>
                  <div className="flex items-center gap-4 mb-6">
                    <TreasureChest />
                    <div>
                      <h3 className="font-pixel text-sm text-ritual-gold mb-1">Guild Treasury</h3>
                      <p className="font-silk text-[9px] text-faded-spirit">
                        {selectedRealmData?.realm_name ?? "Select a realm"}
                      </p>
                    </div>
                  </div>

                  {!selectedRealm ? (
                    <EmptyState icon={"\uD83C\uDFF0"} text="Select a realm to view treasury" />
                  ) : treasuryLoading ? (
                    <LoadingSpinner text="Loading treasury..." />
                  ) : treasuryData ? (
                    <div className="space-y-4">
                      <div className="text-center py-6">
                        <CoinStack count={Math.min(Math.ceil(treasuryData.balanceSol), 8)} />
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", delay: 0.3 }}
                          className="font-pixel text-2xl text-ritual-gold mt-4"
                        >
                          {treasuryData.balanceSol.toFixed(4)} SOL
                        </motion.div>
                        <p className="font-pixel text-[8px] text-faded-spirit mt-1">
                          {treasuryData.balanceLamports.toLocaleString()} lamports
                        </p>
                      </div>

                      <div className="border-t border-ritual-gold/20 pt-4">
                        <h4 className="font-pixel text-[8px] text-faded-spirit mb-2">TREASURY ADDRESS</h4>
                        <p className="font-mono text-[9px] text-ghost-white break-all bg-void-purple/30 p-2 rounded">
                          {treasuryData.treasuryAddress}
                        </p>
                      </div>

                      <div className="border-t border-ritual-gold/20 pt-4">
                        <h4 className="font-pixel text-[8px] text-faded-spirit mb-2">REALM ADDRESS</h4>
                        <p className="font-mono text-[9px] text-ghost-white break-all bg-void-purple/30 p-2 rounded">
                          {treasuryData.realmAddress}
                        </p>
                      </div>

                      <div className="text-center pt-2">
                        <p className="font-silk text-[8px] text-faded-spirit/60">
                          72% of royalties flow here automatically
                        </p>
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={"\uD83D\uDCB0"} text="No treasury data available" />
                  )}
                </Panel>
              </motion.div>
            )}

            {/* ═══ COUNCIL TAB ═══ */}
            {activeTab === "council" && (
              <motion.div
                key="council"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <RealmSelector realms={realms} selected={selectedRealm} onSelect={setSelectedRealm} />

                {/* Wallet connection gate */}
                {!isWalletConnected && (
                  <Panel className="text-center">
                    <p className="font-pixel text-[10px] text-ritual-gold mb-2">Connect wallet to vote</p>
                    <p className="font-silk text-[9px] text-faded-spirit">
                      You need a connected Solana wallet with Reborn NFTs to cast votes
                    </p>
                  </Panel>
                )}

                {/* Vote feedback */}
                {voteError && (
                  <Panel className="!border-blood-pink/50">
                    <p className="font-pixel text-[9px] text-blood-pink">{voteError}</p>
                    <button
                      onClick={() => setVoteError(null)}
                      className="font-silk text-[8px] text-faded-spirit mt-1 hover:text-ghost-white"
                    >
                      Dismiss
                    </button>
                  </Panel>
                )}
                {voteSuccess && (
                  <Panel className="!border-spectral-green/50">
                    <p className="font-pixel text-[9px] text-spectral-green">{voteSuccess}</p>
                    <button
                      onClick={() => setVoteSuccess(null)}
                      className="font-silk text-[8px] text-faded-spirit mt-1 hover:text-ghost-white"
                    >
                      Dismiss
                    </button>
                  </Panel>
                )}

                {!selectedRealm ? (
                  <Panel>
                    <EmptyState
                      icon={"\uD83C\uDFF0"}
                      text="Select a realm to view proposals"
                      subtext="Choose a realm from the Hall tab or above"
                    />
                  </Panel>
                ) : proposalsLoading ? (
                  <LoadingSpinner text="Loading proposals..." />
                ) : proposals.length === 0 ? (
                  <Panel>
                    <EmptyState
                      icon={"\uD83D\uDCDC"}
                      text="No proposals yet"
                      subtext="Council members create proposals through Realms to manage treasury funds"
                    />
                  </Panel>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-pixel text-[10px] text-ritual-gold">
                        {proposalsData?.realmName ?? "Proposals"}
                      </h3>
                      <span className="font-pixel text-[8px] text-faded-spirit">
                        {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {proposals.map((proposal, i) => (
                      <motion.div
                        key={proposal.address}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <ProposalCard
                          proposal={proposal}
                          onVote={(p) => {
                            if (!isWalletConnected) {
                              setVoteError("Connect your Solana wallet first");
                              return;
                            }
                            setVotingProposal(p);
                          }}
                          isVoting={isSubmittingVote}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Wallet bridge — only mounts when Dynamic.xyz is configured */}
      {DYNAMIC_ENV_ID && (
        <WalletBridge
          onAddress={setWalletAddress}
          votingProposal={votingProposal}
          selectedRealmData={selectedRealmData}
          setVoteHandler={(fn) => { voteHandlerRef.current = fn; }}
        />
      )}

      {/* Vote Ceremony Modal */}
      <VoteCeremonyModal
        isOpen={!!votingProposal}
        proposal={votingProposal}
        onVote={handleVote}
        onClose={() => setVotingProposal(null)}
        isSubmitting={isSubmittingVote}
      />
    </div>
  );
}
