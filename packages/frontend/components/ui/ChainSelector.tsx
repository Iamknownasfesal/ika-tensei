"use client";

import { motion } from "framer-motion";
import { SupportedChain, EVM_CHAINS, NON_EVM_CHAINS } from "@/lib/constants";

// ─── Chain Logo (colored circle with abbreviation) ────────────────────────────

function ChainLogo({ chain, size = 40 }: { chain: SupportedChain; size?: number }) {
  const fontSize = size * 0.28;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: chain.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: `0 0 8px ${chain.color}66`,
      }}
    >
      <span
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize,
          color: chain.textColor,
          lineHeight: 1,
          letterSpacing: "-0.5px",
        }}
      >
        {chain.abbreviation.length > 4
          ? chain.abbreviation.slice(0, 4)
          : chain.abbreviation}
      </span>
    </div>
  );
}

// ─── Single Chain Card ────────────────────────────────────────────────────────

function ChainCard({
  chain,
  selected,
  onClick,
}: {
  chain: SupportedChain;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 transition-all duration-150 cursor-pointer w-full"
      style={{
        border: selected
          ? `2px solid ${chain.color}`
          : "2px solid rgba(58, 40, 80, 0.6)",
        background: selected
          ? `${chain.color}22`
          : "rgba(13, 10, 26, 0.6)",
        boxShadow: selected ? `0 0 12px ${chain.color}44` : "none",
      }}
    >
      <ChainLogo chain={chain} size={44} />
      <span
        className="font-pixel text-center leading-tight"
        style={{
          fontSize: "8px",
          color: selected ? chain.color : "rgba(200, 190, 220, 0.8)",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {chain.name}
      </span>
    </motion.button>
  );
}

// ─── Category Header ──────────────────────────────────────────────────────────

function CategoryHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="h-px flex-1 bg-sigil-border/60" />
      <span className="font-pixel text-[9px] text-faded-spirit tracking-widest uppercase">
        {label}
      </span>
      <div className="h-px flex-1 bg-sigil-border/60" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ChainSelectorProps {
  selected: string | null;
  onSelect: (chainId: string) => void;
}

export function ChainSelector({ selected, onSelect }: ChainSelectorProps) {
  return (
    <div className="space-y-5">
      {/* EVM Chains */}
      <div>
        <CategoryHeader label="EVM Chains" />
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2">
          {EVM_CHAINS.map((chain, i) => (
            <motion.div
              key={chain.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <ChainCard
                chain={chain}
                selected={selected === chain.id}
                onClick={() => onSelect(chain.id)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Non-EVM Chains */}
      {NON_EVM_CHAINS.length > 0 && (
        <div>
          <CategoryHeader label="Other Chains" />
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2">
            {NON_EVM_CHAINS.map((chain, i) => (
              <motion.div
                key={chain.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <ChainCard
                  chain={chain}
                  selected={selected === chain.id}
                  onClick={() => onSelect(chain.id)}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* EVM tip */}
      {selected && EVM_CHAINS.some((c) => c.id === selected) && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-silk text-[10px] text-faded-spirit text-center"
        >
          ✦ EVM chains share one deposit address — same key, any EVM network
        </motion.p>
      )}
    </div>
  );
}
