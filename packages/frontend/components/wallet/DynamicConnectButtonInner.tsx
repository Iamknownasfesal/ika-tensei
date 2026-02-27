"use client";

import { useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { useWalletStore } from "@/stores/wallet";
import { PixelButton } from "@/components/ui/PixelButton";

/**
 * Header connect button powered by Dynamic.xyz.
 * Must be rendered inside DynamicContextProvider.
 */
export function DynamicConnectButtonInner() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const { connected, publicKey, connect, disconnect } = useWalletStore();

  // Sync Dynamic wallet state → zustand store
  useEffect(() => {
    if (primaryWallet && isSolanaWallet(primaryWallet)) {
      if (!connected || publicKey !== primaryWallet.address) {
        connect(primaryWallet.address);
      }
    } else if (connected && !primaryWallet) {
      disconnect();
    }
  }, [primaryWallet, connected, publicKey, connect, disconnect]);

  const handleConnect = () => {
    setShowAuthFlow(true);
  };

  const handleDisconnect = async () => {
    await handleLogOut();
    disconnect();
  };

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-silk text-[10px] text-spectral-green">●</span>
        <span className="font-mono text-[10px] text-faded-spirit">
          {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
        </span>
        <PixelButton variant="dark" size="sm" onClick={handleDisconnect}>
          ✕
        </PixelButton>
      </div>
    );
  }

  return (
    <PixelButton variant="primary" size="sm" onClick={handleConnect}>
      Connect Wallet
    </PixelButton>
  );
}
