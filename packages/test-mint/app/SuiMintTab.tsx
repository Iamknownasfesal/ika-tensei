"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { TEST_NFT_PACKAGE_ID, MINT_COUNTER_ID } from "@/lib/constants";

export function SuiMintTab() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [result, setResult] = useState<{ digest: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    if (!account) return;
    setError(null);
    setResult(null);

    if (!MINT_COUNTER_ID) {
      setError("MintCounter object ID not configured. Set NEXT_PUBLIC_MINT_COUNTER_ID env var.");
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${TEST_NFT_PACKAGE_ID}::test_nft::mint_free`,
        arguments: [tx.object(MINT_COUNTER_ID)],
      });

      const res = await signAndExecute({ transaction: tx });
      setResult({ digest: res.digest });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed");
    }
  };

  return (
    <>
      {/* Wallet connection */}
      <div className="flex justify-center mb-6">
        <ConnectButton />
      </div>

      {!account ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">🔗</div>
          <p className="font-silk text-sm text-faded-spirit">
            Connect your Sui wallet to mint
          </p>
          <p className="font-silk text-[10px] text-faded-spirit/50 mt-2">
            Sui Wallet, Suiet, Ethos, Nightly
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected address */}
          <div className="bg-black/30 rounded p-3 border border-sigil-border/50">
            <p className="font-silk text-[10px] text-faded-spirit mb-1">Connected:</p>
            <p className="font-mono text-[11px] text-soul-cyan break-all">
              {account.address.slice(0, 10)}...{account.address.slice(-8)}
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
            <p className="font-pixel text-[10px] text-ghost-white">Ika Test NFT (Sui)</p>
            <p className="font-silk text-[9px] text-faded-spirit">
              A test artifact for the seal ritual
            </p>
          </div>

          {/* NFT Contract (for seal flow) */}
          <div className="bg-black/30 rounded p-3 border border-ritual-gold/20">
            <div className="flex items-center justify-between mb-1">
              <p className="font-silk text-[10px] text-ritual-gold">NFT Contract (use in seal):</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${TEST_NFT_PACKAGE_ID}::test_nft::TestNFT`);
                }}
                className="font-silk text-[9px] text-faded-spirit hover:text-soul-cyan transition-colors"
              >
                copy
              </button>
            </div>
            <p className="font-mono text-[9px] text-soul-cyan break-all select-all">
              {TEST_NFT_PACKAGE_ID}::test_nft::TestNFT
            </p>
          </div>

          {/* Mint button */}
          <button
            onClick={handleMint}
            disabled={isPending}
            className={`w-full py-3 px-6 font-pixel text-sm border-2 transition-all ${
              isPending
                ? "border-sigil-border text-faded-spirit/50 cursor-wait"
                : "border-soul-cyan text-soul-cyan hover:bg-soul-cyan/10 hover:shadow-[0_0_20px_rgba(0,204,255,0.2)]"
            }`}
          >
            {isPending ? "FORGING..." : "MINT TEST NFT"}
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
                  href={`https://suiscan.xyz/testnet/tx/${result.digest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-soul-cyan hover:underline break-all"
                >
                  {result.digest}
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
