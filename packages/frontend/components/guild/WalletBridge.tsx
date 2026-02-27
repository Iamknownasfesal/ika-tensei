"use client";

import { useEffect } from "react";
import { Connection } from "@solana/web3.js";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { buildVoteTransaction } from "@/lib/governance";
import type { GuildRealm, GuildProposal } from "@/lib/api";

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
}: {
  onAddress: (addr: string | null) => void;
  votingProposal: GuildProposal | null;
  selectedRealmData: GuildRealm | undefined;
  setVoteHandler: (fn: ((choice: "yes" | "no" | "abstain") => Promise<void>) | null) => void;
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

      const tx = await buildVoteTransaction(connection, {
        realmAddress: selectedRealmData.realm_address,
        communityMint: selectedRealmData.community_mint,
        governanceAddress: selectedRealmData.governance_address,
        proposalAddress: votingProposal.address,
        walletPubkey: wallet.address,
        rebornAssets: [],
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

  return null;
}
