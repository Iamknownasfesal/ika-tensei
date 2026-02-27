import { create } from "zustand";

// ─── Solana-only wallet store ────────────────────────────────────────────────
// v4: Users connect ONLY a Solana wallet. No multi-chain state.

interface WalletState {
  // Solana connection
  connected: boolean;
  publicKey: string | null;

  // Actions
  connect: (publicKey: string) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  connected: false,
  publicKey: null,

  connect: (publicKey) => set({ connected: true, publicKey }),
  disconnect: () => set({ connected: false, publicKey: null }),
}));
