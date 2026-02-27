"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { SupportedChain } from "@/lib/constants";

// ─── Chain Logo (same as in ChainSelector) ────────────────────────────────────

function ChainBadge({ chain }: { chain: SupportedChain }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1"
      style={{ border: `1px solid ${chain.color}66` }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: chain.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 5,
            color: chain.textColor,
            lineHeight: 1,
          }}
        >
          {chain.abbreviation.slice(0, 4)}
        </span>
      </div>
      <span className="font-pixel text-[9px]" style={{ color: chain.color }}>
        {chain.name}
      </span>
    </div>
  );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleCopy}
      className="nes-btn is-primary font-pixel text-[10px] !py-2 !px-4 flex items-center gap-2 whitespace-nowrap"
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="text-spectral-green"
          >
            ✓ Copied!
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            ⎘ Copy
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DepositAddressProps {
  address: string;
  chain: SupportedChain;
  onConfirmSent?: () => void;
}

export function DepositAddress({ address, chain, onConfirmSent }: DepositAddressProps) {
  const [showQR, setShowQR] = useState(false);

  // Shorten address for display (show first 6 + last 4)
  const shortAddress = address.length > 16
    ? `${address.slice(0, 12)}...${address.slice(-6)}`
    : address;

  return (
    <div className="space-y-4">
      {/* Chain badge */}
      <div className="flex items-center justify-between">
        <ChainBadge chain={chain} />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowQR(!showQR)}
          className="font-pixel text-[9px] text-faded-spirit hover:text-ghost-white transition-colors"
        >
          {showQR ? "▼ Hide QR" : "▲ Show QR"}
        </motion.button>
      </div>

      {/* QR Code (toggleable) */}
      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex justify-center overflow-hidden"
          >
            <div
              className="p-3 bg-white"
              style={{ border: `3px solid ${chain.color}` }}
            >
              <QRCodeSVG
                value={address}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Address display */}
      <div
        className="p-4 relative"
        style={{
          border: `2px solid ${chain.color}66`,
          background: "rgba(13, 10, 26, 0.8)",
        }}
      >
        {/* Full address — monospace, line-wrapped */}
        <p
          className="font-mono text-ghost-white leading-relaxed mb-3 select-all break-all"
          style={{ fontSize: "clamp(10px, 2vw, 13px)" }}
        >
          {address}
        </p>

        {/* Short + copy row */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-faded-spirit">
            {shortAddress}
          </span>
          <CopyButton text={address} />
        </div>
      </div>

      {/* Chain-specific instruction */}
      <div
        className="p-3"
        style={{ border: "1px solid rgba(58, 40, 80, 0.8)", background: "rgba(35, 24, 50, 0.5)" }}
      >
        <p className="font-silk text-sm text-ghost-white leading-relaxed">
          Send your NFT to this address on{" "}
          <span style={{ color: chain.color }}>{chain.name}</span>.
          {chain.chainType === "evm" && (
            <> This address works on all EVM chains.</>
          )}
        </p>
      </div>

      {/* ⚠ Warning */}
      <motion.div
        animate={{
          boxShadow: ["0 0 4px #ff344444", "0 0 12px #ff344444", "0 0 4px #ff344444"],
        }}
        transition={{ duration: 2, repeat: Infinity }}
        className="p-3"
        style={{ border: "2px solid #ff3344aa", background: "rgba(139, 0, 0, 0.2)" }}
      >
        <p className="font-pixel text-[9px] text-demon-red leading-relaxed">
          ⚠ Only send ONE NFT. This address is single-use. Sending tokens
          or multiple NFTs may result in permanent loss.
        </p>
      </motion.div>

      {/* Confirm sent button */}
      {onConfirmSent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center pt-2"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onConfirmSent}
            className="nes-btn is-warning font-pixel text-[10px] !py-3 !px-6"
          >
            ✦ I Sent My NFT — Begin Ritual
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
