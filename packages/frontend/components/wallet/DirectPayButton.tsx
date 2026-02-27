"use client";

import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { Connection, Transaction, SystemProgram, PublicKey } from "@solana/web3.js";
import { motion } from "framer-motion";

/**
 * "Pay X SOL" button that signs + sends directly from the connected Dynamic wallet.
 * Must be rendered inside DynamicContextProvider.
 */
export function DirectPayButton({
  paymentAddress,
  lamports,
  feeSol,
  isVerifying,
  onPaid,
  onError,
}: {
  paymentAddress: string;
  lamports: number;
  feeSol: string;
  isVerifying: boolean;
  onPaid: (txSig: string) => void;
  onError: (err: string) => void;
}) {
  const { primaryWallet } = useDynamicContext();
  const [paying, setPaying] = useState(false);

  const canPay = primaryWallet && isSolanaWallet(primaryWallet);
  const isBusy = paying || isVerifying;

  const handlePay = async () => {
    if (!primaryWallet || !isSolanaWallet(primaryWallet)) return;
    setPaying(true);

    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(primaryWallet.address),
          toPubkey: new PublicKey(paymentAddress),
          lamports,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(primaryWallet.address);

      const signer = await primaryWallet.getSigner();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signedTx = await signer.signTransaction(tx as any);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      onPaid(sig);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  if (!canPay) return null;

  return (
    <motion.button
      whileHover={!isBusy ? { scale: 1.05 } : {}}
      whileTap={!isBusy ? { scale: 0.95 } : {}}
      onClick={handlePay}
      disabled={isBusy}
      className={`nes-btn is-primary font-pixel text-[10px] !py-2 !px-6 ${
        isBusy ? "opacity-50 cursor-wait" : ""
      }`}
    >
      {paying ? "⏳ Signing..." : isVerifying ? "⏳ Verifying..." : `Pay ${feeSol} SOL →`}
    </motion.button>
  );
}
