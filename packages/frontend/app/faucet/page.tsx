"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { BackgroundAtmosphere } from "@/components/ui/BackgroundAtmosphere";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/constants";

// ─── Chain Card ──────────────────────────────────────────────────────────────

function ChainFaucetCard({ chain }: { chain: SupportedChain }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group"
    >
      <motion.div
        className="absolute -inset-[1px] rounded-lg opacity-50 group-hover:opacity-100 transition-opacity"
        style={{
          background: `linear-gradient(135deg, ${chain.color}40, transparent, ${chain.color}20)`,
        }}
      />

      <div
        className="relative bg-void-purple/80 backdrop-blur-sm rounded-lg p-5 border border-sigil-border/50"
        style={{ boxShadow: `inset 0 0 30px ${chain.color}10` }}
      >
        {/* Chain header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-pixel border-2"
            style={{
              borderColor: chain.color,
              backgroundColor: `${chain.color}20`,
              color: chain.color,
              boxShadow: `0 0 12px ${chain.color}40`,
            }}
          >
            {chain.abbreviation.slice(0, 2)}
          </div>
          <div>
            <h3 className="font-pixel text-sm text-ghost-white">{chain.name}</h3>
            <span className="font-silk text-[10px] text-faded-spirit">
              {chain.chainType.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Test NFT contract */}
        {chain.testNftContract ? (
          <div className="mb-4 bg-black/30 rounded p-2">
            <span className="font-silk text-[10px] text-faded-spirit block mb-1">
              Test NFT Contract:
            </span>
            <a
              href={`${chain.explorerUrl}/address/${chain.testNftContract}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-soul-cyan hover:text-soul-cyan/80 break-all underline"
            >
              {chain.testNftContract}
            </a>
          </div>
        ) : (
          <div className="mb-4 bg-blood-pink/10 rounded p-2 border border-blood-pink/20">
            <span className="font-silk text-[10px] text-blood-pink">
              Test NFT not yet deployed
            </span>
          </div>
        )}

        {/* Links */}
        <div className="space-y-2">
          {chain.mintUrl && (
            <a
              href={chain.mintUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full py-2.5 px-3 rounded font-silk text-xs border transition-colors"
              style={{
                backgroundColor: `${chain.color}15`,
                borderColor: `${chain.color}40`,
                color: chain.color,
              }}
            >
              <span>Mint Test NFT</span>
              <span>&rarr;</span>
            </a>
          )}
          {chain.faucetUrl && (
            <a
              href={chain.faucetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full py-2.5 px-3 rounded font-silk text-xs bg-blood-pink/10 border border-blood-pink/30 text-ghost-white hover:bg-blood-pink/20 transition-colors"
            >
              <span>Get testnet {chain.abbreviation}</span>
              <span className="text-faded-spirit">&rarr;</span>
            </a>
          )}
          <a
            href={chain.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full py-2.5 px-3 rounded font-silk text-xs bg-sigil-border/20 border border-sigil-border/30 text-faded-spirit hover:text-ghost-white hover:bg-sigil-border/30 transition-colors"
          >
            <span>Block Explorer</span>
            <span>&rarr;</span>
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Faucet Page ────────────────────────────────────────────────────────

export default function FaucetPage() {

  return (
    <div className="relative min-h-screen bg-ritual-dark overflow-hidden">
      <BackgroundAtmosphere />

      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <motion.div
              animate={{
                textShadow: [
                  "0 0 10px #ffd700",
                  "0 0 20px #ffd700",
                  "0 0 10px #ffd700",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="font-pixel text-2xl md:text-3xl text-ritual-gold mb-3"
            >
              ⚔ SPIRIT FORGE ⚔
            </motion.div>
            <p className="font-silk text-sm text-faded-spirit max-w-md mx-auto">
              Gather testnet tokens and artifacts before the ritual.
              Each chain requires its own gas to forge relics.
            </p>

            <div className="flex items-center justify-center gap-3 mt-6">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-blood-pink/50" />
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-blood-pink text-xs"
              >
                ⛧
              </motion.span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-blood-pink/50" />
            </div>
          </motion.div>

          {/* Supported Chains */}
          <section className="mb-10">
            <h2 className="font-pixel text-sm text-ghost-white mb-4 flex items-center gap-2">
              <span className="text-ritual-gold">ᚠ</span> Supported Chains
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SUPPORTED_CHAINS.map((chain, i) => (
                <motion.div
                  key={chain.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <ChainFaucetCard chain={chain} />
                </motion.div>
              ))}
            </div>
          </section>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-void-purple/50 border border-sigil-border/50 rounded-lg p-5 text-center"
            style={{ boxShadow: "inset 0 0 30px rgba(139,0,0,0.1)" }}
          >
            <p className="font-silk text-xs text-faded-spirit mb-3">
              Once you have testnet tokens and a test NFT, bring it to the Seal
              altar to begin the bridging ritual.
            </p>
            <Link
              href="/seal"
              className="inline-block font-pixel text-xs text-blood-pink hover:text-ghost-white transition-colors"
              style={{ textShadow: "0 0 8px rgba(220,20,60,0.5)" }}
            >
              &rarr; Begin the Seal Ritual &larr;
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
