"use client";

import { useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { motion } from "framer-motion";
import Image from "next/image";

/**
 * SolanaConnectInner — uses useDynamicContext (must be inside DynamicContextProvider).
 * Only rendered when DYNAMIC_ENV_ID is set (see SealPage conditional).
 */
interface SolanaConnectProps {
  onConnect: (publicKey: string) => void;
}

export function SolanaConnectInner({ onConnect }: SolanaConnectProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();

  // Auto-connect if wallet is already connected
  useEffect(() => {
    if (primaryWallet && isSolanaWallet(primaryWallet)) {
      onConnect(primaryWallet.address);
    }
  }, [primaryWallet, onConnect]);

  const handleClick = () => {
    setShowAuthFlow(true);
  };

  const isConnected = primaryWallet && isSolanaWallet(primaryWallet);

  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image src="/art/ika-mascot-v2.png" alt="Ika" width={72} height={72} className="pixelated" />
        </motion.div>
      </div>

      <div>
        <h2 className="font-pixel text-lg text-ritual-gold mb-2">
          Connect Solana Wallet
        </h2>
        <p className="font-silk text-sm text-faded-spirit">
          Phantom · Backpack · Solflare · and more
        </p>
      </div>

      {isConnected ? (
        <div className="space-y-2">
          <p className="font-pixel text-[10px] text-spectral-green">
            ✓ Connected
          </p>
          <p className="font-mono text-[11px] text-faded-spirit break-all">
            {primaryWallet.address.slice(0, 8)}...
            {primaryWallet.address.slice(-6)}
          </p>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClick}
          className="nes-btn is-primary font-pixel text-[11px] !py-3 !px-8"
        >
          ⚡ Connect Wallet
        </motion.button>
      )}
    </div>
  );
}

/**
 * DevModeConnect — shown when there's no Dynamic env ID (local dev).
 * Lets you paste/enter a wallet address manually.
 */
export function DevModeConnect({ onConnect }: SolanaConnectProps) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image src="/art/ika-mascot-v2.png" alt="Ika" width={72} height={72} className="pixelated" />
        </motion.div>
      </div>

      <div>
        <h2 className="font-pixel text-lg text-ritual-gold mb-2">
          Dev Mode
        </h2>
        <p className="font-silk text-sm text-faded-spirit mb-1">
          No DYNAMIC_ENV_ID set — using mock wallet
        </p>
        <p className="font-mono text-[10px] text-faded-spirit/60">
          Set NEXT_PUBLIC_DYNAMIC_ENV_ID to enable real wallet connect
        </p>
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onConnect("DevWallet11111111111111111111111111111111111")}
        className="nes-btn is-warning font-pixel text-[10px] !py-3 !px-8"
      >
        🛠 Mock Connect (Dev)
      </motion.button>
    </div>
  );
}
