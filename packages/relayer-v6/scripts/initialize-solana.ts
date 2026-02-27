/**
 * Initialize Solana program — calls initialize_mint_config and initialize_collection_registry.
 *
 * Usage:
 *   npx tsx scripts/initialize-solana.ts
 */

import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID!);
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Minting dWallet pubkey from DKG (set on Sui side already)
const MINTING_PUBKEY_HEX = '08c48fd5e3baa456dada4f4ac9b819e992df34f2ac48b6237444e7d7ad9c3ea9';

// IDL path
const IDL_PATH = path.resolve(__dirname, '../../solana-program/ika-tensei-reborn/target/idl/ika_tensei_reborn.json');

function loadKeypair(filePath: string): Keypair {
  const raw = readFileSync(filePath, 'utf-8').trim();
  if (raw.startsWith('[')) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(Buffer.from(raw, 'base64'));
}

async function main() {
  console.log('=== Initialize Solana Program ===');
  console.log('Program ID:', PROGRAM_ID.toBase58());
  console.log('RPC URL:', RPC_URL);

  // Load admin keypair (from Anchor.toml: ~/.config/solana/devnet-admin.json)
  const adminKeypairPath = process.env.SOLANA_ADMIN_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/devnet-admin.json`;
  const adminKeypair = loadKeypair(adminKeypairPath);
  console.log('Admin:', adminKeypair.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log('Admin balance:', balance / 1e9, 'SOL');

  // Load IDL and create Anchor program
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf-8'));
  // Override the IDL address with the actual deployed program ID
  idl.address = PROGRAM_ID.toBase58();

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKeypair),
    { commitment: 'confirmed' },
  );
  const program = new anchor.Program(idl, provider);

  // 1. Initialize mint config
  console.log('\n--- Step 1: initialize_mint_config ---');
  const mintingPubkey = Array.from(Buffer.from(MINTING_PUBKEY_HEX, 'hex'));
  console.log('Minting pubkey (32 bytes):', MINTING_PUBKEY_HEX);

  try {
    const tx1 = await program.methods
      .initializeMintConfig(mintingPubkey)
      .accounts({
        admin: adminKeypair.publicKey,
      })
      .rpc();
    console.log('initialize_mint_config TX:', tx1);
  } catch (err: any) {
    if (err.message?.includes('already in use')) {
      console.log('MintConfig PDA already initialized (skipping)');
    } else {
      throw err;
    }
  }

  // 2. Initialize collection registry
  console.log('\n--- Step 2: initialize_collection_registry ---');
  try {
    const tx2 = await program.methods
      .initializeCollectionRegistry()
      .accounts({
        payer: adminKeypair.publicKey,
      })
      .rpc();
    console.log('initialize_collection_registry TX:', tx2);
  } catch (err: any) {
    if (err.message?.includes('already in use')) {
      console.log('CollectionRegistry PDA already initialized (skipping)');
    } else {
      throw err;
    }
  }

  // Verify
  console.log('\n--- Verification ---');
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('mint_config')],
    PROGRAM_ID,
  );
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('collection_registry')],
    PROGRAM_ID,
  );
  console.log('MintConfig PDA:', configPda.toBase58());
  console.log('CollectionRegistry PDA:', registryPda.toBase58());

  const configAccount = await connection.getAccountInfo(configPda);
  const registryAccount = await connection.getAccountInfo(registryPda);
  console.log('MintConfig exists:', !!configAccount);
  console.log('CollectionRegistry exists:', !!registryAccount);

  if (configAccount) {
    // First 8 bytes are discriminator, next 32 are minting_pubkey
    const storedPubkey = Buffer.from(configAccount.data.slice(8, 40)).toString('hex');
    console.log('Stored minting pubkey:', storedPubkey);
    console.log('Match:', storedPubkey === MINTING_PUBKEY_HEX);
  }

  console.log('\n=== Solana Initialization Complete ===');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
