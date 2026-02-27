"use client";

import { useState } from "react";
import { SuiMintTab } from "./SuiMintTab";
import { NearMintTab } from "./NearMintTab";
import { PopkinsMintTab } from "./PopkinsMintTab";

type Chain = "sui" | "near" | "popkins";

const CHAINS: { id: Chain; name: string; color: string }[] = [
  { id: "sui", name: "SUI", color: "#4da2ff" },
  { id: "popkins", name: "POPKINS", color: "#00b894" },
  { id: "near", name: "NEAR", color: "#00c1de" },
];

export default function MintPage() {
  const [activeChain, setActiveChain] = useState<Chain>("sui");

  return (
    <div className="min-h-screen bg-void-purple flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, rgba(77, 162, 255, 0.08), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-xl text-ritual-gold mb-2"
            style={{ textShadow: "0 0 16px #ffd70066" }}
          >
            IKA TEST NFT FORGE
          </h1>
          <p className="font-silk text-xs text-faded-spirit">
            Mint free test NFTs for the seal ritual
          </p>
          <p className="font-silk text-[10px] text-faded-spirit/60 mt-1">
            Sui Testnet &middot; NEAR Testnet
          </p>
        </div>

        {/* Chain tabs */}
        <div className="flex gap-2 mb-4">
          {CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => setActiveChain(chain.id)}
              className="flex-1 py-2.5 px-4 font-pixel text-xs border-2 transition-all"
              style={{
                borderColor: activeChain === chain.id ? chain.color : "#3a2850",
                color: activeChain === chain.id ? chain.color : "#c8bedc",
                backgroundColor: activeChain === chain.id ? `${chain.color}15` : "transparent",
                boxShadow: activeChain === chain.id ? `0 0 12px ${chain.color}30` : "none",
              }}
            >
              {chain.name}
            </button>
          ))}
        </div>

        {/* Main card */}
        <div
          className="border-2 border-sigil-border bg-card-purple/90 p-6"
          style={{ boxShadow: "0 0 30px rgba(77, 162, 255, 0.1)" }}
        >
          {activeChain === "sui" && <SuiMintTab />}
          {activeChain === "popkins" && <PopkinsMintTab />}
          {activeChain === "near" && <NearMintTab />}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <a
            href={activeChain === "near" ? "https://near-faucet.io" : "https://faucet.sui.io"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-silk text-[10px] text-soul-cyan/70 hover:text-soul-cyan block"
          >
            Need {activeChain === "near" ? "NEAR" : "SUI"}? Get testnet tokens here &rarr;
          </a>
          <a
            href="https://ikatensei.xyz"
            className="font-silk text-[10px] text-faded-spirit/50 hover:text-faded-spirit block"
          >
            &larr; Back to Ika Tensei
          </a>
        </div>
      </div>
    </div>
  );
}
