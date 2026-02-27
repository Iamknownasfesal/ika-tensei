/**
 * Update the MintConfig PDA on Solana with the new minting dWallet pubkey.
 *
 * Usage: npx tsx scripts/update-solana-minting-pubkey.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID!);
const SEED_MINT_CONFIG = Buffer.from('mint_config');

// update_mint_config discriminator from IDL
const DISCRIMINATOR = Buffer.from([243, 113, 184, 98, 212, 234, 198, 193]);

async function main() {
  const newPubkeyHex = process.env.MINTING_DWALLET_PUBKEY;
  if (!newPubkeyHex) {
    throw new Error('MINTING_DWALLET_PUBKEY not set in .env');
  }

  const newPubkey = Buffer.from(newPubkeyHex, 'hex');
  if (newPubkey.length !== 32) {
    throw new Error(`Expected 32-byte pubkey, got ${newPubkey.length}`);
  }

  console.log(`New minting pubkey: ${newPubkeyHex}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  // Load relayer keypair (admin)
  const keypairPath = process.env.RELAYER_KEYPAIR_PATH || './relayer-keypair.json';
  const keypairData = JSON.parse(readFileSync(keypairPath, 'utf-8'));
  const admin = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  // Derive MintConfig PDA
  const [mintConfigPda] = PublicKey.findProgramAddressSync(
    [SEED_MINT_CONFIG],
    PROGRAM_ID,
  );
  console.log(`MintConfig PDA: ${mintConfigPda.toBase58()}`);

  // Build instruction data: discriminator + new_minting_pubkey (32 bytes as [u8; 32])
  const data = Buffer.concat([DISCRIMINATOR, newPubkey]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: mintConfigPda, isSigner: false, isWritable: true },  // config
      { pubkey: admin.publicKey, isSigner: true, isWritable: false }, // admin
    ],
    data,
  });

  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const { blockhash } = await connection.getLatestBlockhash();

  const message = new TransactionMessage({
    payerKey: admin.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([admin]);

  console.log('\nSending update_mint_config transaction...');
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  console.log(`TX: ${sig}`);

  await connection.confirmTransaction(sig, 'confirmed');
  console.log('Confirmed! MintConfig updated with new minting pubkey.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
