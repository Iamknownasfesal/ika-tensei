/**
 * Fix: Set minting pubkey on MintingAuthority from existing MINTING_DWALLET_PUBLIC_OUTPUT.
 *
 * The minting dWallet already exists and .env has the public_output,
 * but set_minting_pubkey was never called on-chain.
 *
 * Usage: npx tsx scripts/fix-minting-pubkey.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { Curve, publicKeyFromDWalletOutput } from '@ika.xyz/sdk';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

function loadSuiKeypair(path: string): Ed25519Keypair {
  const raw = readFileSync(path, 'utf-8').trim();
  if (raw.startsWith('[')) {
    const bytes = new Uint8Array(JSON.parse(raw));
    const seed = bytes.length === 64 ? bytes.slice(0, 32) : bytes;
    return Ed25519Keypair.fromSecretKey(seed);
  }
  return Ed25519Keypair.fromSecretKey(raw);
}

async function main() {
  const publicOutputHex = process.env.MINTING_DWALLET_PUBLIC_OUTPUT;
  if (!publicOutputHex) {
    throw new Error('MINTING_DWALLET_PUBLIC_OUTPUT not set in .env');
  }

  const suiPackageId = process.env.SUI_PACKAGE_ID!;
  const mintingAuthorityId = process.env.SUI_MINTING_AUTHORITY_ID!;
  const adminCapId = process.env.SUI_ADMIN_CAP_ID!;
  const suiKeypairPath = process.env.SUI_KEYPAIR_PATH || './sui-keypair.json';
  const suiRpcUrl = process.env.SUI_RPC_URL!;

  console.log('Deriving Ed25519 pubkey from MINTING_DWALLET_PUBLIC_OUTPUT...');

  const activeOutput = new Uint8Array(Buffer.from(publicOutputHex, 'hex'));
  console.log(`Public output length: ${activeOutput.length} bytes`);

  const pubkey = await publicKeyFromDWalletOutput(Curve.ED25519, activeOutput);
  const pubkeyHex = Buffer.from(pubkey).toString('hex');
  console.log(`Ed25519 pubkey: ${pubkeyHex} (${pubkey.length} bytes)`);

  if (pubkey.length !== 32) {
    throw new Error(`Expected 32-byte pubkey, got ${pubkey.length}`);
  }

  // Call set_minting_pubkey on-chain
  console.log('\nCalling set_minting_pubkey on MintingAuthority...');
  console.log(`  Package: ${suiPackageId}`);
  console.log(`  MintingAuthority: ${mintingAuthorityId}`);
  console.log(`  AdminCap: ${adminCapId}`);

  const sui = new SuiClient({ url: suiRpcUrl });
  const keypair = loadSuiKeypair(suiKeypairPath);
  console.log(`  Signer: ${keypair.getPublicKey().toSuiAddress()}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${suiPackageId}::orchestrator::set_minting_pubkey`,
    arguments: [
      tx.object(mintingAuthorityId),
      tx.object(adminCapId),
      tx.pure.vector('u8', Array.from(pubkey)),
    ],
  });

  const result = await sui.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  console.log(`\nTransaction: ${result.digest}`);
  console.log(`Status: ${result.effects?.status?.status}`);

  if (result.effects?.status?.status === 'success') {
    console.log('\nMinting pubkey set successfully!');
    console.log(`MINTING_DWALLET_PUBKEY=${pubkeyHex}`);
  } else {
    console.error('Transaction failed:', result.effects?.status);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
