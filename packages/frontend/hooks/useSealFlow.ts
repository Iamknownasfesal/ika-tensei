"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  startSeal,
  confirmPayment as apiConfirmPayment,
  confirmDeposit as apiConfirmDeposit,
  detectNFTs as apiDetectNFTs,
  getSealStatus,
  type SealStatusValue,
  type DetectedNFT,
} from "@/lib/api";
import { DYNAMIC_ENV_ID } from "@/lib/constants";

const POLL_INTERVAL_MS = 5000;

// ─── State Shape ──────────────────────────────────────────────────────────────

export type SealFlowStep =
  | "connect"
  | "select_chain"
  | "payment"
  | "deposit"
  | "waiting"
  | "complete";

export type DepositSubState =
  | "show_address"
  | "enter_contract"
  | "detecting"
  | "found";

export interface SealFlowState {
  step: SealFlowStep;
  sourceChain: string | null;
  sessionId: string | null;
  paymentAddress: string | null;
  feeAmountLamports: number | null;
  depositAddress: string | null;
  dwalletId: string | null;
  sealStatus: SealStatusValue | null;
  rebornNFT: { mint: string; name: string; image: string } | null;
  error: string | null;
  isLoading: boolean;
  /** Sub-state within the deposit step */
  depositSubState: DepositSubState;
  /** Detected NFTs at the deposit address */
  detectedNFTs: DetectedNFT[] | null;
  /** Contract being searched */
  nftContract: string | null;
}

// Status label map (for UI display)
export const STATUS_LABELS: Record<SealStatusValue, string> = {
  awaiting_payment: "Awaiting SOL payment...",
  payment_confirmed: "Payment confirmed!",
  creating_dwallet: "Creating deposit wallet...",
  waiting_deposit: "Awaiting NFT deposit...",
  verifying_deposit: "Verifying NFT on source chain...",
  uploading_metadata: "Uploading metadata to Arweave...",
  creating_seal: "Creating seal on Sui...",
  signing: "IKA dWallet signing ceremony...",
  minting: "Minting reborn NFT on Solana...",
  complete: "Ritual complete!",
  error: "Something went wrong",
};

// Ordered status progression for the waiting step display
export const STATUS_ORDER: SealStatusValue[] = [
  "verifying_deposit",
  "uploading_metadata",
  "creating_seal",
  "signing",
  "minting",
  "complete",
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

const INITIAL_STATE: SealFlowState = {
  step: "connect",
  sourceChain: null,
  sessionId: null,
  paymentAddress: null,
  feeAmountLamports: null,
  depositAddress: null,
  dwalletId: null,
  sealStatus: null,
  rebornNFT: null,
  error: null,
  isLoading: false,
  depositSubState: "show_address",
  detectedNFTs: null,
  nftContract: null,
};

export function useSealFlow() {
  const [state, setState] = useState<SealFlowState>(INITIAL_STATE);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDetectRef = useRef(false);

  // ── Wallet connected → move to chain selection ──────────────────────────────
  const onWalletConnected = useCallback(() => {
    setState((s) => ({ ...s, step: "select_chain", error: null }));
  }, []);

  // ── Chain selected → call API to create session → move to payment ───────────
  const selectChain = useCallback(
    async (chainId: string, solanaWallet: string) => {
      setState((s) => ({
        ...s,
        sourceChain: chainId,
        isLoading: true,
        error: null,
      }));

      try {
        const { sessionId, paymentAddress, feeAmountLamports } =
          await startSeal(solanaWallet, chainId);
        setState((s) => ({
          ...s,
          sessionId,
          paymentAddress,
          feeAmountLamports,
          step: "payment",
          isLoading: false,
        }));
      } catch (err) {
        // Only use demo mode when Dynamic.xyz is not configured (local dev)
        if (!DYNAMIC_ENV_ID) {
          const mockSessionId = "demo-" + Date.now().toString(36);
          setState((s) => ({
            ...s,
            sessionId: mockSessionId,
            paymentAddress: "DemoPaymentAddress1111111111111111111111111",
            feeAmountLamports: 10_000_000, // 0.01 SOL
            step: "payment",
            isLoading: false,
          }));
        } else {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to start seal session",
            isLoading: false,
          }));
        }
      }
    },
    []
  );

  // ── Payment confirmed → create dWallet → move to deposit ───────────────────
  const confirmPayment = useCallback(
    async (paymentTxSignature: string) => {
      if (!state.sessionId) return;

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const { dwalletId, depositAddress } = await apiConfirmPayment(
          state.sessionId,
          paymentTxSignature
        );
        setState((s) => ({
          ...s,
          dwalletId,
          depositAddress,
          step: "deposit",
          depositSubState: "show_address",
          isLoading: false,
        }));
      } catch (err) {
        // Demo mode fallback
        if (state.sessionId?.startsWith("demo-")) {
          const evmChains = [
            "ethereum", "polygon", "arbitrum", "base", "optimism", "bsc",
            "avalanche", "base-sepolia", "ethereum-sepolia",
          ];
          const isEvm = evmChains.includes(state.sourceChain ?? "");
          const mockAddress = isEvm
            ? "0x" + Array.from({ length: 40 }, () =>
                Math.floor(Math.random() * 16).toString(16)
              ).join("")
            : Array.from({ length: 44 }, () =>
                "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789"[
                  Math.floor(Math.random() * 58)
                ]
              ).join("");
          setState((s) => ({
            ...s,
            dwalletId: "demo-dwallet-" + Date.now(),
            depositAddress: mockAddress,
            step: "deposit",
            depositSubState: "show_address",
            isLoading: false,
          }));
        } else {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Payment confirmation failed",
            isLoading: false,
          }));
        }
      }
    },
    [state.sessionId, state.sourceChain]
  );

  // ── User sent NFT → move to contract entry ──────────────────────────────────
  const goToContractEntry = useCallback(() => {
    setState((s) => ({ ...s, depositSubState: "enter_contract", error: null }));
  }, []);

  // ── Detect NFTs at deposit address for the given contract ────────────────────
  const startDetection = useCallback(
    async (nftContract: string) => {
      if (!state.sessionId) return;

      cancelDetectRef.current = false;
      setState((s) => ({
        ...s,
        nftContract,
        depositSubState: "detecting",
        detectedNFTs: null,
        error: null,
      }));
    },
    [state.sessionId]
  );

  // Detection polling effect
  useEffect(() => {
    if (
      state.step !== "deposit" ||
      state.depositSubState !== "detecting" ||
      !state.sessionId ||
      !state.nftContract
    )
      return;

    // Demo mode
    if (state.sessionId.startsWith("demo-")) {
      setState((s) => ({
        ...s,
        depositSubState: "found",
        detectedNFTs: [
          {
            contract: s.nftContract || "0xDemoContract",
            tokenId: "42",
            name: "Demo NFT #42",
          },
        ],
      }));
      return;
    }

    cancelDetectRef.current = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 24; // 2 minutes at 5s intervals

    const poll = async () => {
      if (cancelDetectRef.current) return;

      try {
        const result = await apiDetectNFTs(state.sessionId!, state.nftContract!);
        if (cancelDetectRef.current) return;

        if (result.nfts.length > 0) {
          setState((s) => ({
            ...s,
            depositSubState: "found",
            detectedNFTs: result.nfts,
          }));
          return; // Stop polling
        }

        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          setState((s) => ({
            ...s,
            error: "No NFTs found. Check the contract address and try again.",
            depositSubState: "enter_contract",
          }));
          return;
        }
      } catch {
        // Network error — keep polling
      }

      if (!cancelDetectRef.current) {
        detectRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      cancelDetectRef.current = true;
      if (detectRef.current) clearTimeout(detectRef.current);
    };
  }, [state.step, state.depositSubState, state.sessionId, state.nftContract]);

  // ── Select a detected NFT → confirm deposit → start processing ──────────────
  const selectDetectedNFT = useCallback(
    async (nft: DetectedNFT) => {
      if (!state.sessionId) return;

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        await apiConfirmDeposit(state.sessionId, nft.contract, nft.tokenId);
        setState((s) => ({
          ...s,
          step: "waiting",
          sealStatus: "verifying_deposit",
          isLoading: false,
        }));
      } catch (err) {
        if (state.sessionId?.startsWith("demo-")) {
          setState((s) => ({
            ...s,
            step: "waiting",
            sealStatus: "verifying_deposit",
            isLoading: false,
          }));
        } else {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to confirm deposit",
            isLoading: false,
          }));
        }
      }
    },
    [state.sessionId]
  );

  // ── Manual fallback: confirm deposit with contract + tokenId ─────────────────
  const manualConfirmDeposit = useCallback(
    async (nftContract: string, tokenId: string) => {
      if (!state.sessionId) return;

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        await apiConfirmDeposit(state.sessionId, nftContract, tokenId);
        setState((s) => ({
          ...s,
          step: "waiting",
          sealStatus: "verifying_deposit",
          isLoading: false,
        }));
      } catch (err) {
        if (state.sessionId?.startsWith("demo-")) {
          setState((s) => ({
            ...s,
            step: "waiting",
            sealStatus: "verifying_deposit",
            isLoading: false,
          }));
        } else {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Deposit confirmation failed",
            isLoading: false,
          }));
        }
      }
    },
    [state.sessionId]
  );

  // ── Polling loop for seal status ──────────────────────────────────────────────
  useEffect(() => {
    if (state.step !== "waiting" || !state.sessionId) return;
    // Don't poll for demo sessions
    if (state.sessionId.startsWith("demo-")) return;

    const poll = async () => {
      try {
        const result = await getSealStatus(state.sessionId!);
        setState((s) => ({ ...s, sealStatus: result.status }));

        if (result.status === "complete") {
          setState((s) => ({
            ...s,
            step: "complete",
            rebornNFT: result.rebornNFT ?? null,
          }));
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (result.status === "error") {
          setState((s) => ({
            ...s,
            error: result.error ?? "An error occurred during sealing",
          }));
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Network error — keep polling silently
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state.step, state.sessionId]);

  // ── Reset everything ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (detectRef.current) clearTimeout(detectRef.current);
    cancelDetectRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  // ── Go back one step ─────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (detectRef.current) clearTimeout(detectRef.current);
    cancelDetectRef.current = true;

    setState((s) => {
      switch (s.step) {
        case "select_chain":
          return { ...INITIAL_STATE, step: "connect" as SealFlowStep };
        case "payment":
          return {
            ...s,
            step: "select_chain" as SealFlowStep,
            sessionId: null,
            paymentAddress: null,
            feeAmountLamports: null,
            error: null,
          };
        case "deposit":
          // If in a sub-state, go back within deposit
          if (s.depositSubState === "enter_contract" || s.depositSubState === "detecting" || s.depositSubState === "found") {
            return {
              ...s,
              depositSubState: "show_address" as DepositSubState,
              detectedNFTs: null,
              nftContract: null,
              error: null,
            };
          }
          return {
            ...s,
            step: "payment" as SealFlowStep,
            depositAddress: null,
            dwalletId: null,
            error: null,
          };
        default:
          return s;
      }
    });
  }, []);

  // ── Demo/Simulation: advance through all states for testing ──────────────────
  const simulateProgress = useCallback(() => {
    if (!state.sessionId) return;

    const statuses: SealStatusValue[] = [
      "uploading_metadata",
      "creating_seal",
      "signing",
      "minting",
      "complete",
    ];

    let i = 0;
    const advance = () => {
      if (i >= statuses.length) {
        setState((s) => ({
          ...s,
          step: "complete",
          sealStatus: "complete",
          rebornNFT: {
            mint: "7x9Y2Zk...demo123",
            name: "My NFT \u2726 Reborn",
            image: "https://placehold.co/400x400/ff3366/ffd700?text=REBORN",
          },
        }));
        return;
      }

      setState((s) => ({ ...s, sealStatus: statuses[i] }));
      i++;
      setTimeout(advance, 1500);
    };

    setState((s) => ({
      ...s,
      sealStatus: "verifying_deposit",
      step: "waiting",
    }));
    setTimeout(advance, 1500);
  }, [state.sessionId]);

  return {
    ...state,
    onWalletConnected,
    selectChain,
    confirmPayment,
    goToContractEntry,
    startDetection,
    selectDetectedNFT,
    manualConfirmDeposit,
    reset,
    goBack,
    simulateProgress,
  };
}
