"use client";

import { useWalletStore } from "@/stores/wallet";
import { PixelButton } from "@/components/ui/PixelButton";
import { DYNAMIC_ENV_ID } from "@/lib/constants";
import dynamic from "next/dynamic";

// Lazy-load the Dynamic-aware button to avoid SSR crash
const DynamicConnectButton = dynamic(
  () => import("./DynamicConnectButtonInner").then((m) => m.DynamicConnectButtonInner),
  { ssr: false, loading: () => <PixelButton variant="dark" size="sm">...</PixelButton> }
);

// v5: Solana-only connect button — uses Dynamic.xyz when configured
export function ConnectButton() {
  if (DYNAMIC_ENV_ID) {
    return <DynamicConnectButton />;
  }

  // Dev mode fallback
  return <DevConnectButton />;
}

function DevConnectButton() {
  const { connected, publicKey, connect, disconnect } = useWalletStore();

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-silk text-[10px] text-spectral-green">●</span>
        <span className="font-mono text-[10px] text-faded-spirit">
          {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
        </span>
        <PixelButton variant="dark" size="sm" onClick={disconnect}>
          ✕
        </PixelButton>
      </div>
    );
  }

  return (
    <PixelButton
      variant="primary"
      size="sm"
      onClick={() => connect("DevWallet11111111111111111111111111111111111")}
    >
      Connect Wallet
    </PixelButton>
  );
}
