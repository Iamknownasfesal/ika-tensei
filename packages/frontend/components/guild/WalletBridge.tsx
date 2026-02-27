"use client";

import { useEffect } from "react";
import { Connection } from "@solana/web3.js";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { buildVoteTransaction, buildCreateProposalTransaction } from "@/lib/governance";
import type { GuildRealm, GuildProposal } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Fetch Reborn NFT mint addresses for a wallet, filtered by collection */
async function fetchRebornAssets(walletAddress: string, collectionName: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reborn?address=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.nfts || [])
      .filter((n: { collectionName?: string }) => n.collectionName === collectionName)
      .map((n: { mint: string }) => n.mint);
  } catch {
    return [];
  }
}

/**
 * Invisible bridge component that connects the Dynamic.xyz wallet to the guild page.
 * Must be rendered inside DynamicContextProvider.
 * Reports wallet address and provides a vote handler callback.
 */
export function WalletBridge({
  onAddress,
  votingProposal,
  selectedRealmData,
  setVoteHandler,
  setProposalHandler,
}: {
  onAddress: (addr: string | null) => void;
  votingProposal: GuildProposal | null;
  selectedRealmData: GuildRealm | undefined;
  setVoteHandler: (fn: ((choice: "yes" | "no" | "abstain") => Promise<void>) | null) => void;
  setProposalHandler: (fn: ((title: string, description: string) => Promise<void>) | null) => void;
}) {
  const { primaryWallet } = useDynamicContext();

  // Report wallet address
  useEffect(() => {
    if (primaryWallet && isSolanaWallet(primaryWallet)) {
      onAddress(primaryWallet.address);
    } else {
      onAddress(null);
    }
  }, [primaryWallet, onAddress]);

  // Provide vote handler
  useEffect(() => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet) || !selectedRealmData) {
      setVoteHandler(null);
      return;
    }

    const wallet = primaryWallet;

    const handler = async (choice: "yes" | "no" | "abstain") => {
      if (!votingProposal) throw new Error("No proposal selected");
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");

      const rebornAssets = await fetchRebornAssets(wallet.address, selectedRealmData.collection_name);

      const tx = await buildVoteTransaction(connection, {
        realmAddress: selectedRealmData.realm_address,
        communityMint: selectedRealmData.community_mint,
        governanceAddress: selectedRealmData.governance_address,
        proposalAddress: votingProposal.address,
        walletPubkey: wallet.address,
        rebornAssets,
        voteKind: choice,
      });

      const signer = await wallet.getSigner();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signedTx = await signer.signTransaction(tx as any);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
    };

    setVoteHandler(handler);
  }, [primaryWallet, selectedRealmData, votingProposal, setVoteHandler]);

  // Provide proposal creation handler
  useEffect(() => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet) || !selectedRealmData) {
      setProposalHandler(null);
      return;
    }

    const wallet = primaryWallet;

    const handler = async (title: string, description: string) => {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");

      const rebornAssets = await fetchRebornAssets(wallet.address, selectedRealmData.collection_name);
      if (rebornAssets.length === 0) {
        throw new Error("You need at least one Reborn NFT from this collection to create proposals");
      }

      const tx = await buildCreateProposalTransaction(connection, {
        realmAddress: selectedRealmData.realm_address,
        communityMint: selectedRealmData.community_mint,
        governanceAddress: selectedRealmData.governance_address,
        walletPubkey: wallet.address,
        rebornAssets,
        title,
        description,
      });

      const signer = await wallet.getSigner();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signedTx = await signer.signTransaction(tx as any);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
    };

    setProposalHandler(handler);
  }, [primaryWallet, selectedRealmData, setProposalHandler]);

  return null;
}
