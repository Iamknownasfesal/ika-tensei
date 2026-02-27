"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { POPKINS_PACKAGE_ID, POPKINS_MINT_COUNTER_ID } from "@/lib/constants";

export function PopkinsMintTab() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [result, setResult] = useState<{ digest: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    if (!account) return;
    setError(null);
    setResult(null);

    if (!POPKINS_MINT_COUNTER_ID) {
      setError("Popkins MintCounter not configured. Set NEXT_PUBLIC_POPKINS_MINT_COUNTER_ID env var.");
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${POPKINS_PACKAGE_ID}::popkins_nft::mint_free`,
        arguments: [tx.object(POPKINS_MINT_COUNTER_ID)],
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
          <div className="text-4xl mb-4">🦕</div>
          <p className="font-silk text-sm text-faded-spirit">
            Connect your Sui wallet to mint Popkins
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
            <img
              src="https://storage.claynosaurz.com/popkins/images/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"
              alt="Popkins"
              className="w-32 h-32 mx-auto mb-3 border-2 border-[#00b894]/30 rounded-lg object-cover"
              style={{ boxShadow: "0 0 20px rgba(0, 184, 148, 0.15)" }}
            />
            <p className="font-pixel text-[10px] text-ghost-white">Popkins NFT (Sui)</p>
            <p className="font-silk text-[9px] text-faded-spirit">
              Mischievous critters with random traits
            </p>
            <p className="font-silk text-[8px] text-faded-spirit/50 mt-1">
              Species &middot; Mutation &middot; Skin &middot; Color &middot; Background &middot; Shape
            </p>
          </div>

          {/* NFT Contract (for seal flow) */}
          <div className="bg-black/30 rounded p-3 border border-ritual-gold/20">
            <div className="flex items-center justify-between mb-1">
              <p className="font-silk text-[10px] text-ritual-gold">NFT Contract (use in seal):</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${POPKINS_PACKAGE_ID}::popkins_nft::Popkins`);
                }}
                className="font-silk text-[9px] text-faded-spirit hover:text-soul-cyan transition-colors"
              >
                copy
              </button>
            </div>
            <p className="font-mono text-[9px] text-soul-cyan break-all select-all">
              {POPKINS_PACKAGE_ID}::popkins_nft::Popkins
            </p>
          </div>

          {/* Mint button */}
          <button
            onClick={handleMint}
            disabled={isPending}
            className={`w-full py-3 px-6 font-pixel text-sm border-2 transition-all ${
              isPending
                ? "border-sigil-border text-faded-spirit/50 cursor-wait"
                : "border-[#00b894] text-[#00b894] hover:bg-[#00b894]/10 hover:shadow-[0_0_20px_rgba(0,184,148,0.2)]"
            }`}
          >
            {isPending ? "HATCHING..." : "MINT POPKINS"}
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
                POPKINS HATCHED!
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
