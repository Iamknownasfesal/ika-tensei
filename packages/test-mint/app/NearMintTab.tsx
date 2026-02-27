"use client";

import { useState, useEffect, useCallback } from "react";
import { setupWalletSelector, actionCreators, type WalletSelector, type AccountState } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { NEAR_TEST_NFT_CONTRACT, NEAR_NETWORK_ID } from "@/lib/constants";

import "@near-wallet-selector/modal-ui/styles.css";

export function NearMintTab() {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accounts, setAccounts] = useState<AccountState[]>([]);
  const [isMinting, setIsMinting] = useState(false);
  const [result, setResult] = useState<{ txHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAccount = accounts.find((a) => a.active);

  // Initialize wallet selector
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const sel = await setupWalletSelector({
        network: NEAR_NETWORK_ID,
        modules: [setupMyNearWallet()],
      });

      const m = setupModal(sel, {
        contractId: NEAR_TEST_NFT_CONTRACT,
      });

      if (cancelled) return;

      const state = sel.store.getState();
      setAccounts(state.accounts);
      setSelector(sel);
      setModal(m);

      const sub = sel.store.observable.subscribe((state) => {
        setAccounts(state.accounts);
      });

      return () => sub.unsubscribe();
    };

    init();
    return () => { cancelled = true; };
  }, []);

  const handleConnect = () => {
    modal?.show();
  };

  const handleDisconnect = useCallback(async () => {
    if (!selector) return;
    const wallet = await selector.wallet();
    await wallet.signOut();
  }, [selector]);

  const handleMint = async () => {
    if (!selector || !activeAccount) return;
    setError(null);
    setResult(null);
    setIsMinting(true);

    try {
      const wallet = await selector.wallet();

      const outcome = await wallet.signAndSendTransaction({
        receiverId: NEAR_TEST_NFT_CONTRACT,
        actions: [
          actionCreators.functionCall(
            "mint_free",
            {},
            BigInt("30000000000000"), // 30 TGas
            BigInt("10000000000000000000000"), // 0.01 NEAR for storage
          ),
        ],
      });

      if (outcome) {
        // FinalExecutionOutcome has transaction_outcome.id
        const txHash =
          typeof outcome === "object" && "transaction_outcome" in outcome
            ? (outcome as { transaction_outcome: { id: string } }).transaction_outcome.id
            : String(outcome);
        setResult({ txHash });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <>
      {/* Wallet connection */}
      <div className="flex justify-center mb-6">
        {activeAccount ? (
          <button
            onClick={handleDisconnect}
            className="py-2 px-4 font-silk text-xs border border-sigil-border text-faded-spirit hover:text-ghost-white hover:border-blood-pink/50 transition-colors rounded"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="py-2 px-4 font-silk text-xs border-2 border-[#00c1de] text-[#00c1de] hover:bg-[#00c1de]/10 transition-colors rounded"
          >
            Connect NEAR Wallet
          </button>
        )}
      </div>

      {!activeAccount ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">🔗</div>
          <p className="font-silk text-sm text-faded-spirit">
            Connect your NEAR wallet to mint
          </p>
          <p className="font-silk text-[10px] text-faded-spirit/50 mt-2">
            MyNearWallet (testnet)
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected address */}
          <div className="bg-black/30 rounded p-3 border border-sigil-border/50">
            <p className="font-silk text-[10px] text-faded-spirit mb-1">Connected:</p>
            <p className="font-mono text-[11px] text-[#00c1de] break-all">
              {activeAccount.accountId}
            </p>
          </div>

          {/* NFT preview */}
          <div className="text-center py-4">
            <div
              className="w-32 h-32 mx-auto mb-3 border-2 border-ritual-gold/30 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #1a0a2e, #0d0a1a)",
                boxShadow: "0 0 20px rgba(255, 215, 0, 0.1)",
              }}
            >
              <span className="font-pixel text-ritual-gold text-xs">IKA TEST</span>
            </div>
            <p className="font-pixel text-[10px] text-ghost-white">Ika Test NFT (NEAR)</p>
            <p className="font-silk text-[9px] text-faded-spirit">
              A test artifact for the seal ritual
            </p>
            <p className="font-silk text-[9px] text-faded-spirit/60 mt-1">
              Costs 0.01 NEAR (storage deposit)
            </p>
          </div>

          {/* NFT Contract (for seal flow) */}
          <div className="bg-black/30 rounded p-3 border border-ritual-gold/20">
            <div className="flex items-center justify-between mb-1">
              <p className="font-silk text-[10px] text-ritual-gold">NFT Contract (use in seal):</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(NEAR_TEST_NFT_CONTRACT);
                }}
                className="font-silk text-[9px] text-faded-spirit hover:text-[#00c1de] transition-colors"
              >
                copy
              </button>
            </div>
            <p className="font-mono text-[9px] text-[#00c1de] break-all select-all">
              {NEAR_TEST_NFT_CONTRACT}
            </p>
          </div>

          {/* Mint button */}
          <button
            onClick={handleMint}
            disabled={isMinting}
            className={`w-full py-3 px-6 font-pixel text-sm border-2 transition-all ${
              isMinting
                ? "border-sigil-border text-faded-spirit/50 cursor-wait"
                : "border-[#00c1de] text-[#00c1de] hover:bg-[#00c1de]/10 hover:shadow-[0_0_20px_rgba(0,193,222,0.2)]"
            }`}
          >
            {isMinting ? "FORGING..." : "MINT TEST NFT"}
          </button>

          {/* Error */}
          {error && (
            <div className="p-3 border border-blood-pink/30 bg-blood-pink/10 rounded">
              <p className="font-silk text-[11px] text-blood-pink break-all">{error}</p>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="p-4 border border-spectral-green/30 bg-spectral-green/10 rounded space-y-2">
              <p className="font-pixel text-xs text-spectral-green text-center">
                NFT MINTED!
              </p>
              <div>
                <p className="font-silk text-[10px] text-faded-spirit">Transaction:</p>
                <a
                  href={`https://testnet.nearblocks.io/txns/${result.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-soul-cyan hover:underline break-all"
                >
                  {result.txHash}
                </a>
              </div>
              <p className="font-silk text-[10px] text-faded-spirit text-center mt-2">
                Now go to{" "}
                <a
                  href="https://ikatensei.xyz/seal"
                  className="text-ritual-gold hover:underline"
                >
                  ikatensei.xyz/seal
                </a>
                {" "}to bridge it!
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
