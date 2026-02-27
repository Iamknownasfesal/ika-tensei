"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSealFlow, STATUS_ORDER, STATUS_LABELS, type DepositSubState } from "@/hooks/useSealFlow";
import { useWalletStore } from "@/stores/wallet";
import { getChainById, DYNAMIC_ENV_ID } from "@/lib/constants";
import { SummoningCircle } from "@/components/ui/SummoningCircle";
import { DialogueBox } from "@/components/ui/DialogueBox";
import { BackgroundAtmosphere } from "@/components/ui/BackgroundAtmosphere";
import { ChainSelector } from "@/components/ui/ChainSelector";
import { DepositAddress } from "@/components/ui/DepositAddress";
import { DevModeConnect } from "@/components/wallet/SolanaConnect";
import Image from "next/image";
import type { SealStatusValue, DetectedNFT } from "@/lib/api";

// Lazy-load Direct Pay button (needs DynamicContextProvider)
const DirectPayButton = dynamic(
  () => import("@/components/wallet/DirectPayButton").then((m) => m.DirectPayButton),
  { ssr: false, loading: () => <span className="font-pixel text-[10px] text-faded-spirit">...</span> }
);

// Dynamic import to avoid SSR crash — useDynamicContext requires DynamicContextProvider
const SolanaConnectInner = dynamic(
  () => import("@/components/wallet/SolanaConnect").then((m) => m.SolanaConnectInner),
  { ssr: false }
);

// ─── Blood Pact Modal ──────────────────────────────────────────────────────────

interface BloodPactModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function BloodPactModal({ onConfirm, onCancel }: BloodPactModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", damping: 15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg"
      >
        <motion.div
          className="absolute -inset-2 rounded-lg"
          style={{
            background:
              "linear-gradient(45deg, #dc143c, #8b0000, #dc143c, #8b0000)",
            backgroundSize: "400% 400%",
          }}
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <div
          className="relative bg-void-purple p-6 m-0.5 rounded-lg"
          style={{ boxShadow: "inset 0 0 50px rgba(220,20,60,0.2)" }}
        >
          <div className="text-center mb-6">
            <motion.div
              animate={{
                textShadow: [
                  "0 0 10px #dc143c",
                  "0 0 20px #dc143c",
                  "0 0 10px #dc143c",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="font-pixel text-xl text-blood-pink mb-2"
            >
              ⛧ BLOOD PACT ⛧
            </motion.div>
            <p className="font-silk text-faded-spirit text-xs">
              The eternal binding awaits...
            </p>
          </div>
          <div className="bg-blood-pink/10 p-4 rounded mb-6 border border-blood-pink/20">
            <p className="font-silk text-sm text-faded-spirit text-center">
              By confirming, your soul shall be bound to the eternal chain. This
              pact cannot be undone. The spirits bear witness...
            </p>
          </div>
          <div className="flex gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCancel}
              className="px-6 py-3 font-pixel text-xs border-2 border-void-purple/50 text-faded-spirit hover:border-faded-spirit transition-colors"
            >
              I REFUSE
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onConfirm}
              className="px-6 py-3 font-pixel text-xs bg-blood-pink text-white border-2 border-blood-pink hover:bg-red-700 hover:border-red-700 transition-colors relative overflow-hidden"
              style={{ boxShadow: "0 0 20px rgba(220,20,60,0.5)" }}
            >
              <motion.span
                className="absolute inset-0 bg-white/20"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.5 }}
              />
              I ACCEPT THE PACT
            </motion.button>
          </div>
          <div className="text-center mt-6 text-blood-pink/50">
            ☠︎ THE IKA TENSEI ☠︎
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Runic Progress Indicator ─────────────────────────────────────────────────

const RUNE_GLYPHS = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ"];
const RITUAL_STEPS_LABELS = [
  "Verifying...",
  "Uploading...",
  "Sealing...",
  "Signing...",
  "Minting...",
];

function RunicProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex justify-between items-center max-w-md mx-auto mt-6">
      {RITUAL_STEPS_LABELS.map((label, index) => {
        const isActive = index <= currentStep;
        const isCurrent = index === currentStep;
        return (
          <div key={index} className="flex flex-col items-center relative">
            {index < RITUAL_STEPS_LABELS.length - 1 && (
              <div
                className="absolute top-3 left-1/2 w-full h-0.5 -translate-x-0"
                style={{
                  backgroundColor: isActive ? "#dc143c" : "#2a1a1a",
                  boxShadow: isActive
                    ? "0 0 10px rgba(220,20,60,0.5)"
                    : "none",
                  width: "200%",
                  zIndex: -1,
                }}
              />
            )}
            <motion.div
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                isActive
                  ? "border-blood-pink bg-blood-pink/20"
                  : "border-void-purple/30 bg-void-purple/20"
              }`}
              animate={
                isCurrent
                  ? {
                      boxShadow: [
                        "0 0 10px #dc143c",
                        "0 0 25px #dc143c",
                        "0 0 10px #dc143c",
                      ],
                    }
                  : {}
              }
              transition={{ duration: 1, repeat: Infinity }}
            >
              <span
                className="text-lg"
                style={{
                  color: isActive ? "#ffd700" : "#4a2c2c",
                  textShadow: isActive ? "0 0 10px #ffd700" : "none",
                }}
              >
                {RUNE_GLYPHS[index]}
              </span>
            </motion.div>
            <span
              className={`font-silk text-[8px] mt-2 text-center max-w-20 transition-colors duration-300 ${
                isActive ? "text-faded-spirit" : "text-void-purple/50"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step breadcrumb ──────────────────────────────────────────────────────────

const STEPS = [
  "Connect",
  "Chain",
  "Pay",
  "Deposit",
  "Summoning",
  "Complete",
] as const;

function stepToIndex(step: string): number {
  switch (step) {
    case "connect": return 0;
    case "select_chain": return 1;
    case "payment": return 2;
    case "deposit": return 3;
    case "waiting": return 4;
    case "complete": return 5;
    default: return 0;
  }
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 md:gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <motion.div
                animate={
                  active
                    ? { boxShadow: ["0 0 4px #ffd700", "0 0 12px #ffd700", "0 0 4px #ffd700"] }
                    : {}
                }
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-4 h-4 flex items-center justify-center"
                style={{
                  background: done ? "#00ff88" : active ? "#ffd700" : "transparent",
                  border: `2px solid ${done ? "#00ff88" : active ? "#ffd700" : "#3a2850"}`,
                }}
              >
                {done && <span style={{ fontSize: 8, color: "#000" }}>✓</span>}
              </motion.div>
              <span
                className="font-pixel hidden md:block"
                style={{
                  fontSize: 7,
                  color: done ? "#00ff88" : active ? "#ffd700" : "#3a2850",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="w-4 md:w-6 h-px mb-4"
                style={{ background: i < current ? "#00ff88" : "#3a2850" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className={`border-2 border-sigil-border bg-card-purple/90 p-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ─── Step 1: Connect Wallet ───────────────────────────────────────────────────

function ConnectStep({ onConnect }: { onConnect: (pk: string) => void }) {
  return (
    <Panel>
      <DialogueBox
        speaker="Ika"
        portrait="neutral"
        text="The ritual begins with your Solana wallet. Connect Phantom, Backpack, or Solflare to begin."
        variant="normal"
      />
      <div className="mt-6">
        {DYNAMIC_ENV_ID ? (
          <SolanaConnectInner onConnect={onConnect} />
        ) : (
          <DevModeConnect onConnect={onConnect} />
        )}
      </div>
    </Panel>
  );
}

// ─── Step 2: Select Source Chain ─────────────────────────────────────────────

function SelectChainStep({
  selectedChain,
  onSelect,
  onConfirm,
  isLoading,
  error,
  onBack,
}: {
  selectedChain: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <Panel>
      <div className="mb-4">
        <DialogueBox
          speaker="Ika"
          portrait="excited"
          text="Which chain holds your NFT? Choose the source realm..."
          variant="normal"
        />
      </div>

      <ChainSelector selected={selectedChain} onSelect={onSelect} />

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 rounded border"
          style={{
            background: "rgba(255, 68, 68, 0.1)",
            border: "1px solid rgba(255, 68, 68, 0.3)",
          }}
        >
          <span className="font-pixel text-[11px] text-demon-red">{error}</span>
        </motion.div>
      )}

      <div className="flex gap-3 justify-between mt-6">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="nes-btn is-dark font-pixel text-[10px] !py-2 !px-4"
        >
          ← Back
        </motion.button>
        <motion.button
          whileHover={selectedChain && !isLoading ? { scale: 1.05 } : {}}
          whileTap={selectedChain && !isLoading ? { scale: 0.95 } : {}}
          onClick={onConfirm}
          disabled={!selectedChain || isLoading}
          className={`nes-btn font-pixel text-[10px] !py-2 !px-6 ${
            !selectedChain || isLoading ? "opacity-50 cursor-not-allowed" : "is-primary"
          }`}
        >
          {isLoading ? "⏳ Preparing..." : "Continue to Payment →"}
        </motion.button>
      </div>
    </Panel>
  );
}

// ─── Step 3: Payment ──────────────────────────────────────────────────────────

function PaymentStep({
  paymentAddress,
  feeAmountLamports,
  isLoading,
  error,
  onConfirmPayment,
  onBack,
}: {
  paymentAddress: string;
  feeAmountLamports: number;
  isLoading: boolean;
  error: string | null;
  onConfirmPayment: (txSig: string) => void;
  onBack: () => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState("");
  const feeSol = (feeAmountLamports / 1e9).toFixed(4);

  const displayError = payError || error;

  return (
    <Panel>
      <DialogueBox
        speaker="Ika"
        portrait="neutral"
        text={`The ritual requires an offering of ${feeSol} SOL.`}
        variant="normal"
      />

      <div className="mt-5 space-y-4">
        <div className="text-center p-4 border border-ritual-gold/30 bg-ritual-gold/5">
          <p className="font-pixel text-[10px] text-faded-spirit mb-2">Ritual Fee</p>
          <p
            className="font-pixel text-2xl text-ritual-gold"
            style={{ textShadow: "0 0 12px #ffd70066" }}
          >
            ◎ {feeSol} SOL
          </p>
          <p className="font-mono text-[9px] text-faded-spirit mt-2">
            ({feeAmountLamports.toLocaleString()} lamports)
          </p>
        </div>

        {displayError && (
          <div className="p-2 border border-demon-red/30 bg-demon-red/10">
            <span className="font-pixel text-[10px] text-demon-red">{displayError}</span>
          </div>
        )}

        {/* Manual fallback (hidden by default) */}
        {showManual && (
          <div className="space-y-3 p-3 bg-black/30 border border-sigil-border">
            <p className="font-pixel text-[9px] text-faded-spirit">
              Send {feeSol} SOL to:
            </p>
            <p className="font-mono text-[10px] text-ghost-white break-all select-all">
              {paymentAddress}
            </p>
            <input
              type="text"
              value={txSignature}
              onChange={(e) => setTxSignature(e.target.value)}
              placeholder="Paste transaction signature..."
              className="w-full bg-void-purple border-2 border-sigil-border p-2 font-mono text-[11px] text-ghost-white placeholder:text-faded-spirit/30 focus:border-ritual-gold focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3 justify-between mt-6">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="nes-btn is-dark font-pixel text-[10px] !py-2 !px-4"
        >
          ← Back
        </motion.button>

        {showManual ? (
          <motion.button
            whileHover={txSignature.length > 10 && !isLoading ? { scale: 1.05 } : {}}
            whileTap={txSignature.length > 10 && !isLoading ? { scale: 0.95 } : {}}
            onClick={() => onConfirmPayment(txSignature.trim())}
            disabled={txSignature.length < 10 || isLoading}
            className={`nes-btn font-pixel text-[10px] !py-2 !px-6 ${
              txSignature.length < 10 || isLoading ? "opacity-50 cursor-not-allowed" : "is-primary"
            }`}
          >
            {isLoading ? "⏳ Verifying..." : "Confirm →"}
          </motion.button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManual(true)}
              className="font-silk text-[9px] text-faded-spirit/50 hover:text-faded-spirit underline"
            >
              manual
            </button>
            {DYNAMIC_ENV_ID ? (
              <DirectPayButton
                paymentAddress={paymentAddress}
                lamports={feeAmountLamports}
                feeSol={feeSol}
                isVerifying={isLoading}
                onPaid={onConfirmPayment}
                onError={setPayError}
              />
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowManual(true)}
                className="nes-btn is-primary font-pixel text-[10px] !py-2 !px-6"
              >
                {`Pay ${feeSol} SOL →`}
              </motion.button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Step 4: Deposit + Auto-Detect ───────────────────────────────────────────

function DepositStep({
  address,
  chainId,
  depositSubState,
  detectedNFTs,
  isLoading,
  error,
  onConfirmSent,
  onStartDetection,
  onSelectNFT,
  onManualConfirm,
  onBack,
}: {
  address: string;
  chainId: string;
  depositSubState: DepositSubState;
  detectedNFTs: DetectedNFT[] | null;
  isLoading: boolean;
  error: string | null;
  onConfirmSent: () => void;
  onStartDetection: (nftContract: string) => void;
  onSelectNFT: (nft: DetectedNFT) => void;
  onManualConfirm: (nftContract: string, tokenId: string) => void;
  onBack: () => void;
}) {
  const chain = getChainById(chainId);
  const [contractInput, setContractInput] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualTokenId, setManualTokenId] = useState("");

  if (!chain) return null;

  return (
    <Panel>
      {/* Sub-state: Show deposit address */}
      {depositSubState === "show_address" && (
        <>
          <div className="mb-5">
            <DialogueBox
              speaker="Ika"
              portrait="excited"
              text={`Your sacred deposit address is ready! Send your NFT from ${chain.name} to this address.`}
              variant="normal"
            />
          </div>
          <DepositAddress address={address} chain={chain} onConfirmSent={onConfirmSent} />
        </>
      )}

      {/* Sub-state: Enter contract address */}
      {depositSubState === "enter_contract" && (
        <>
          <DialogueBox
            speaker="Ika"
            portrait="neutral"
            text="Enter the NFT contract address and I'll find your token automatically..."
            variant="system"
          />
          <div className="mt-5 space-y-4">
            <div>
              <label className="font-pixel text-[9px] text-faded-spirit block mb-2">
                NFT Contract Address
              </label>
              <input
                type="text"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                placeholder="0x993C47d2a7cBf2575076c239d03adcf4480dA141"
                className="w-full bg-void-purple border-2 border-sigil-border p-3 font-mono text-[11px] text-ghost-white placeholder:text-faded-spirit/30 focus:border-ritual-gold focus:outline-none"
              />
            </div>

            <div className="flex gap-3 justify-between">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onBack}
                className="nes-btn is-dark font-pixel text-[10px] !py-2 !px-4"
              >
                &larr; Back
              </motion.button>
              <motion.button
                whileHover={contractInput.length > 2 ? { scale: 1.05 } : {}}
                whileTap={contractInput.length > 2 ? { scale: 0.95 } : {}}
                onClick={() => onStartDetection(contractInput.trim())}
                disabled={contractInput.length <= 2}
                className={`nes-btn font-pixel text-[10px] !py-2 !px-6 ${
                  contractInput.length <= 2 ? "opacity-50 cursor-not-allowed" : "is-primary"
                }`}
              >
                Detect NFT &rarr;
              </motion.button>
            </div>

            {/* Manual fallback */}
            <div className="pt-2 border-t border-sigil-border/30">
              <button
                onClick={() => setShowManual(!showManual)}
                className="font-silk text-[10px] text-faded-spirit/60 hover:text-faded-spirit transition-colors"
              >
                {showManual ? "Hide manual entry" : "Enter token ID manually instead"}
              </button>
              {showManual && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="font-pixel text-[9px] text-faded-spirit block mb-2">
                      Token ID
                    </label>
                    <input
                      type="text"
                      value={manualTokenId}
                      onChange={(e) => setManualTokenId(e.target.value)}
                      placeholder="1"
                      className="w-full bg-void-purple border-2 border-sigil-border p-3 font-mono text-[11px] text-ghost-white placeholder:text-faded-spirit/30 focus:border-ritual-gold focus:outline-none"
                    />
                  </div>
                  <motion.button
                    whileHover={contractInput.length > 2 && manualTokenId.length > 0 ? { scale: 1.05 } : {}}
                    whileTap={contractInput.length > 2 && manualTokenId.length > 0 ? { scale: 0.95 } : {}}
                    onClick={() => onManualConfirm(contractInput.trim(), manualTokenId.trim())}
                    disabled={contractInput.length <= 2 || manualTokenId.length === 0 || isLoading}
                    className={`w-full nes-btn font-pixel text-[10px] !py-2 ${
                      contractInput.length <= 2 || manualTokenId.length === 0 || isLoading
                        ? "opacity-50 cursor-not-allowed"
                        : "is-warning"
                    }`}
                  >
                    {isLoading ? "Verifying..." : "Submit Manually"}
                  </motion.button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sub-state: Detecting (polling) */}
      {depositSubState === "detecting" && (
        <>
          <DialogueBox
            speaker="Ika"
            portrait="neutral"
            text="Scanning the source chain for your NFT..."
            variant="system"
          />
          <div className="flex flex-col items-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 border-4 border-sigil-border border-t-soul-cyan rounded-full mb-4"
            />
            <p className="font-pixel text-[10px] text-faded-spirit animate-pulse">
              Searching for NFTs at deposit address...
            </p>
            <p className="font-silk text-[9px] text-faded-spirit/50 mt-2">
              This may take a moment
            </p>
          </div>
        </>
      )}

      {/* Sub-state: NFTs found */}
      {depositSubState === "found" && detectedNFTs && (
        <>
          <DialogueBox
            speaker="Ika"
            portrait="excited"
            text={`Found ${detectedNFTs.length} NFT${detectedNFTs.length > 1 ? "s" : ""} at the deposit address! Select one to seal.`}
            variant="normal"
          />
          <div className="mt-4 space-y-3">
            {detectedNFTs.map((nft) => (
              <motion.div
                key={`${nft.contract}-${nft.tokenId}`}
                whileHover={{ scale: 1.02 }}
                className="p-4 border-2 border-sigil-border bg-card-purple/90 flex items-center gap-4 cursor-pointer hover:border-soul-cyan/50 transition-colors"
                onClick={() => !isLoading && onSelectNFT(nft)}
              >
                {/* Thumbnail */}
                {nft.imageUrl ? (
                  <img
                    src={nft.imageUrl}
                    alt={nft.name || "NFT"}
                    className="w-14 h-14 object-cover"
                    style={{ imageRendering: "pixelated" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-14 h-14 bg-void-purple border border-sigil-border/50 flex items-center justify-center">
                    <span className="font-pixel text-faded-spirit/40 text-xl">?</span>
                  </div>
                )}

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="font-pixel text-xs text-ghost-white truncate">
                    {nft.name || "NFT"}
                  </p>
                  <p className="font-mono text-[9px] text-faded-spirit truncate mt-1">
                    ID: {nft.tokenId.length > 20
                      ? `${nft.tokenId.slice(0, 10)}...${nft.tokenId.slice(-6)}`
                      : nft.tokenId}
                  </p>
                </div>

                {/* Select */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={isLoading}
                  className={`nes-btn font-pixel text-[9px] !py-2 !px-3 flex-shrink-0 ${
                    isLoading ? "opacity-50 cursor-not-allowed" : "is-primary"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNFT(nft);
                  }}
                >
                  {isLoading ? "..." : "Seal"}
                </motion.button>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-3 p-2 border border-demon-red/30 bg-demon-red/10">
          <span className="font-pixel text-[10px] text-demon-red">{error}</span>
        </div>
      )}

      {/* Back button for detecting/found states */}
      {(depositSubState === "detecting" || depositSubState === "found") && (
        <div className="mt-4 flex">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="nes-btn is-dark font-pixel text-[10px] !py-2 !px-4"
          >
            &larr; Back
          </motion.button>
        </div>
      )}

      {/* Back button for show_address */}
      {depositSubState === "show_address" && (
        <div className="mt-4 flex">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="nes-btn is-dark font-pixel text-[10px] !py-2 !px-4"
          >
            &larr; Back
          </motion.button>
        </div>
      )}
    </Panel>
  );
}

// ─── Step 6: Waiting ──────────────────────────────────────────────────────────

function WaitingStep({
  sealStatus,
  chainId,
  depositAddress,
  onSimulate,
}: {
  sealStatus: string | null;
  chainId: string | null;
  depositAddress: string | null;
  onSimulate?: () => void;
}) {
  const currentStatusIdx = sealStatus
    ? STATUS_ORDER.indexOf(sealStatus as SealStatusValue)
    : 0;

  const circlePhase =
    sealStatus === "complete"
      ? "overload"
      : sealStatus === "minting" || sealStatus === "signing"
        ? "active"
        : sealStatus === "uploading_metadata" || sealStatus === "creating_seal"
          ? "charging"
          : "idle";

  const ritualStep = useMemo(() => {
    if (!sealStatus) return 0;
    const idx = STATUS_ORDER.indexOf(sealStatus as SealStatusValue);
    return Math.max(0, idx);
  }, [sealStatus]);

  return (
    <Panel>
      <h2 className="font-pixel text-center text-ritual-gold text-sm mb-6">
        ✦ The Summoning Is In Progress ✦
      </h2>

      <div className="flex justify-center mb-6">
        <SummoningCircle phase={circlePhase} size={280} />
      </div>

      <div className="mb-6 mt-6">
        <DialogueBox
          speaker="Ritual"
          portrait="neutral"
          variant="system"
          text={
            sealStatus
              ? (STATUS_LABELS[sealStatus as keyof typeof STATUS_LABELS] ?? "Processing...")
              : "Verifying your NFT deposit on the source chain..."
          }
        />
      </div>

      <RunicProgress currentStep={ritualStep} />

      <div className="space-y-2 mb-6 mt-4">
        {STATUS_ORDER.filter((s) => s !== "error").map((status, i) => {
          const done = i < currentStatusIdx;
          const active = i === currentStatusIdx;
          return (
            <div key={status} className="flex items-center gap-3">
              <motion.div
                animate={
                  active
                    ? { boxShadow: ["0 0 4px #ffd700", "0 0 12px #ffd700", "0 0 4px #ffd700"] }
                    : {}
                }
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-4 h-4 flex-shrink-0 flex items-center justify-center"
                style={{
                  background: done ? "#00ff88" : active ? "#ffd70033" : "transparent",
                  border: `2px solid ${done ? "#00ff88" : active ? "#ffd700" : "#3a2850"}`,
                }}
              >
                {done && <span style={{ fontSize: 8, color: "#000" }}>✓</span>}
                {active && (
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="w-2 h-2"
                    style={{ background: "#ffd700" }}
                  />
                )}
              </motion.div>
              <span
                className="font-pixel text-[9px]"
                style={{
                  color: done ? "#00ff88" : active ? "#ffd700" : "rgba(200,190,220,0.3)",
                }}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>
          );
        })}
      </div>

      {depositAddress && chainId && (
        <div
          className="p-3 text-center"
          style={{ border: "1px solid #3a285066", background: "rgba(13,10,26,0.5)" }}
        >
          <p className="font-pixel text-[8px] text-faded-spirit mb-1">
            Deposit address ({getChainById(chainId)?.name})
          </p>
          <p className="font-mono text-[10px] text-ghost-white break-all">
            {depositAddress.slice(0, 10)}...{depositAddress.slice(-8)}
          </p>
        </div>
      )}

      {onSimulate && (
        <button
          onClick={onSimulate}
          className="mt-4 nes-btn is-warning font-pixel text-[9px] w-full"
        >
          ⚡ Demo: Simulate Full Ritual
        </button>
      )}
    </Panel>
  );
}

// ─── Step 7: Complete ─────────────────────────────────────────────────────────

function CompleteStep({
  rebornNFT,
  chainId,
  onReset,
}: {
  rebornNFT: { mint: string; name: string; image: string } | null;
  chainId: string | null;
  onReset: () => void;
}) {
  const chain = chainId ? getChainById(chainId) : null;

  const [shake, setShake] = useState(false);
  useEffect(() => {
    setShake(true);
    const timer = setTimeout(() => setShake(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const particles = Array.from({ length: 16 }, (_, i) => ({
    color: ["#00ff88", "#ffd700", "#ff3366", "#9945ff"][i % 4],
    left: `${(i * 6.25 + Math.random() * 5) % 100}%`,
    duration: 2 + (i % 3) * 0.5,
    delay: (i % 8) * 0.15,
  }));

  return (
    <Panel>
      <motion.div
        animate={
          shake
            ? { x: [0, -8, 8, -8, 8, -4, 4, 0], y: [0, 4, -4, 6, -6, 3, -3, 0] }
            : {}
        }
        transition={{ duration: 0.5 }}
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          background: shake
            ? "radial-gradient(circle, transparent 30%, rgba(255,215,0,0.1) 60%, rgba(255,215,0,0.3) 100%)"
            : "transparent",
        }}
      />

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map((p, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2"
            style={{ backgroundColor: p.color, left: p.left, bottom: "20%" }}
            animate={{
              y: [0, -400],
              x: [0, (i % 2 === 0 ? 1 : -1) * 40],
              opacity: [1, 0],
              scale: [1, 0.3],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              repeatDelay: p.duration * 0.5,
            }}
          />
        ))}
      </div>

      <motion.h2
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 8 }}
        className="font-pixel text-center text-3xl text-spectral-green mb-6"
        style={{ textShadow: "0 0 20px #00ff88" }}
      >
        RITUAL COMPLETE!
      </motion.h2>

      <div className="flex justify-center mb-6">
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <Image src="/art/ika-mascot-v2.png" alt="Ika" width={80} height={80} className="pixelated" />
        </motion.div>
      </div>

      <DialogueBox
        speaker="Ika"
        portrait="excited"
        variant="normal"
        text={
          rebornNFT
            ? `${rebornNFT.name} has been reborn on Solana! Your NFT has transcended chains and lives again.`
            : "Your NFT has been reborn on Solana! The ritual is complete."
        }
      />

      {rebornNFT && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6 p-4 border-2 border-spectral-green/50 bg-black/30"
        >
          {rebornNFT.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rebornNFT.image}
              alt={rebornNFT.name}
              className="w-32 h-32 mx-auto mb-3 pixelated object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          )}
          <h3
            className="font-pixel text-center text-sm text-ritual-gold mb-1"
            style={{ textShadow: "0 0 8px #ffd700" }}
          >
            {rebornNFT.name}
          </h3>
          <p className="font-mono text-[9px] text-faded-spirit text-center break-all mb-4">
            {rebornNFT.mint}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href={`https://explorer.solana.com/address/${rebornNFT.mint}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="nes-btn is-success font-pixel text-[9px] !py-2 !px-3"
            >
              Solana Explorer
            </a>
            <a
              href={`https://magiceden.io/item-details/${rebornNFT.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="nes-btn is-primary font-pixel text-[9px] !py-2 !px-3"
            >
              Magic Eden
            </a>
          </div>
        </motion.div>
      )}

      {chain && (
        <p className="font-silk text-xs text-faded-spirit text-center mt-4">
          Original NFT permanently sealed on{" "}
          <span style={{ color: chain.color }}>{chain.name}</span> via IKA dWallet
        </p>
      )}

      <div className="flex justify-center mt-8">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onReset}
          className="nes-btn is-warning font-pixel text-[10px] !py-3 !px-8"
        >
          ✦ Seal Another NFT
        </motion.button>
      </div>
    </Panel>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SealPage() {
  const { connected, publicKey, connect } = useWalletStore();
  const flow = useSealFlow();
  const [showBloodPact, setShowBloodPact] = useState(false);
  const [pendingChain, setPendingChain] = useState<string | null>(null);

  const handleWalletConnect = (pk: string) => {
    connect(pk);
    if (flow.step === "connect") {
      flow.onWalletConnected();
    }
  };

  const handleConfirmSeal = () => {
    setShowBloodPact(false);
    const chain = pendingChain || flow.sourceChain;
    if (chain && publicKey) {
      flow.selectChain(chain, publicKey);
    }
  };

  const effectiveStep =
    connected && flow.step === "connect" ? "select_chain" : flow.step;
  const stepIndex = stepToIndex(effectiveStep);

  return (
    <div className="min-h-screen bg-void-purple relative overflow-hidden">
      <BackgroundAtmosphere mood="mystical" />

      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-8 pb-6 relative z-10"
      >
        <h1
          className="font-pixel text-3xl md:text-4xl text-ritual-gold mb-2 tracking-wider"
          style={{ textShadow: "0 0 16px #ffd70066" }}
        >
          ✦ THE SOUL SEAL RITUAL ✦
        </h1>
        <p className="font-silk text-faded-spirit text-xs tracking-widest">
          NFT Reincarnation · Powered by IKA dWallet
        </p>
      </motion.header>

      <div className="relative z-10 px-4 mb-6">
        <div className="max-w-2xl mx-auto">
          <StepIndicator current={stepIndex} />
        </div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 pb-16">
        <AnimatePresence mode="wait">
          {effectiveStep === "connect" && (
            <ConnectStep key="connect" onConnect={handleWalletConnect} />
          )}

          {effectiveStep === "select_chain" && (
            <SelectChainStep
              key="select_chain"
              selectedChain={pendingChain ?? flow.sourceChain}
              onSelect={(id) => {
                setPendingChain(id);
              }}
              onConfirm={() => setShowBloodPact(true)}
              isLoading={flow.isLoading}
              error={flow.error}
              onBack={flow.goBack}
            />
          )}

          {effectiveStep === "payment" && flow.paymentAddress && flow.feeAmountLamports && (
            <PaymentStep
              key="payment"
              paymentAddress={flow.paymentAddress}
              feeAmountLamports={flow.feeAmountLamports}
              isLoading={flow.isLoading}
              error={flow.error}
              onConfirmPayment={flow.confirmPayment}
              onBack={flow.goBack}
            />
          )}

          {effectiveStep === "deposit" && flow.depositAddress && (
            <DepositStep
              key="deposit"
              address={flow.depositAddress}
              chainId={flow.sourceChain!}
              depositSubState={flow.depositSubState}
              detectedNFTs={flow.detectedNFTs}
              isLoading={flow.isLoading}
              error={flow.error}
              onConfirmSent={flow.goToContractEntry}
              onStartDetection={flow.startDetection}
              onSelectNFT={flow.selectDetectedNFT}
              onManualConfirm={flow.manualConfirmDeposit}
              onBack={flow.goBack}
            />
          )}

          {effectiveStep === "waiting" && (
            <WaitingStep
              key="waiting"
              sealStatus={flow.sealStatus}
              chainId={flow.sourceChain}
              depositAddress={flow.depositAddress}
              onSimulate={flow.simulateProgress}
            />
          )}

          {effectiveStep === "complete" && (
            <CompleteStep
              key="complete"
              rebornNFT={flow.rebornNFT}
              chainId={flow.sourceChain}
              onReset={flow.reset}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showBloodPact && (
            <BloodPactModal
              onConfirm={handleConfirmSeal}
              onCancel={() => setShowBloodPact(false)}
            />
          )}
        </AnimatePresence>

        <div className="text-center mt-8">
          <Link
            href="/"
            className="font-pixel text-[9px] text-faded-spirit hover:text-ghost-white transition-colors"
          >
            ← Return to the Sanctum
          </Link>
        </div>
      </div>
    </div>
  );
}
