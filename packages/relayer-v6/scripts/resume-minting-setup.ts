/**
 * Resume minting dWallet setup — polls for Active state and completes setup.
 *
 * Usage:
 *   npx tsx scripts/resume-minting-setup.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import {
  IkaClient,
  Curve,
  publicKeyFromDWalletOutput,
  getNetworkConfig,
} from '@ika.xyz/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// From the create_minting_dwallet transaction
const MINTING_DWALLET_ID = '0x03cd775d557d82947560f442247cd102b8027d8c011e84b2d3440946a11eefd1';

// DKG outputs from prepareDKGAsync (we need to re-read these from the chain
// or store them — for now we'll just extract the pubkey from the Active output)

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
  const suiRpcUrl = process.env.SUI_RPC_URL!;
  const suiPackageId = process.env.SUI_PACKAGE_ID!;
  const suiKeypairPath = process.env.SUI_KEYPAIR_PATH || './sui-keypair.json';
  const ikaNetwork = (process.env.IKA_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const adminCapId = process.env.SUI_ADMIN_CAP_ID!;
  const mintingAuthorityId = process.env.SUI_MINTING_AUTHORITY_ID!;

  console.log('=== Resume Minting dWallet Setup ===');
  console.log('dWallet ID:', MINTING_DWALLET_ID);

  const suiKeypair = loadSuiKeypair(suiKeypairPath);
  const sui = new SuiClient({ url: suiRpcUrl });
  const ikaConfig = getNetworkConfig(ikaNetwork);
  const ikaClient = new IkaClient({ suiClient: sui, config: ikaConfig });
  await ikaClient.initialize();
  console.log('IKA client initialized');

  // First, check current state
  console.log('Checking current dWallet state...');
  try {
    const dwallet = await ikaClient.getDWallet(MINTING_DWALLET_ID);
    const stateKeys = Object.keys(dwallet.state || {});
    console.log('Current state:', stateKeys);

    if (dwallet.state?.Active) {
      console.log('dWallet is already Active!');
      const activeOutput = new Uint8Array(dwallet.state.Active.public_output);
      const pubkey = await publicKeyFromDWalletOutput(Curve.ED25519, activeOutput);
      const pubkeyHex = Buffer.from(pubkey).toString('hex');
      console.log('Pubkey:', pubkeyHex);

      // Set minting pubkey
      await setMintingPubkey(sui, suiKeypair, suiPackageId, mintingAuthorityId, adminCapId, pubkey);
      return;
    }
  } catch (err) {
    console.log('Could not fetch dWallet state directly, will poll...');
  }

  // Poll with 5-minute timeout
  console.log('Polling for Active state (timeout: 5 min)...');
  const activeDWallet = await ikaClient.getDWalletInParticularState(
    MINTING_DWALLET_ID,
    'Active',
    { timeout: 300_000 },
  );

  const activeOutput = new Uint8Array(activeDWallet.state.Active!.public_output);
  const pubkey = await publicKeyFromDWalletOutput(Curve.ED25519, activeOutput);
  const pubkeyHex = Buffer.from(pubkey).toString('hex');
  console.log('Minting dWallet pubkey:', pubkeyHex);

  // Set minting pubkey
  await setMintingPubkey(sui, suiKeypair, suiPackageId, mintingAuthorityId, adminCapId, pubkey);
}

async function setMintingPubkey(
  sui: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  mintingAuthorityId: string,
  adminCapId: string,
  pubkey: Uint8Array,
): Promise<void> {
  const pubkeyHex = Buffer.from(pubkey).toString('hex');

  console.log('\nSetting minting pubkey on-chain...');
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::orchestrator::set_minting_pubkey`,
    arguments: [
      tx.object(mintingAuthorityId),
      tx.object(adminCapId),
      tx.pure.vector('u8', Array.from(pubkey)),
    ],
  });

  const result = await sui.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });
  console.log('set_minting_pubkey TX:', result.digest);

  // Update .env — we need the DKG outputs too, but those were from prepareDKGAsync
  // which was run in the original script. We need to re-derive them.
  // Since this is a shared dWallet, the userSecretKeyShare is public on-chain.
  // Let's fetch it from the dWallet object.
  console.log('\nFetching DKG outputs from chain...');

  // For shared dWallets, the user_secret_key_share and public_output
  // are stored on-chain in the DWallet object.
  const dwalletObj = await sui.getObject({
    id: MINTING_DWALLET_ID,
    options: { showContent: true },
  });

  if (dwalletObj.data?.content?.dataType === 'moveObject') {
    const fields = dwalletObj.data.content.fields as Record<string, unknown>;
    console.log('dWallet fields:', Object.keys(fields));

    // The public_user_secret_key_share and user_public_output should be in the object
    const secretKeyShare = fields.public_user_secret_key_share as number[] | undefined;
    const publicOutput = fields.user_public_output as number[] | undefined;

    if (secretKeyShare && publicOutput) {
      const secretKeyShareHex = Buffer.from(new Uint8Array(secretKeyShare)).toString('hex');
      const publicOutputHex = Buffer.from(new Uint8Array(publicOutput)).toString('hex');

      console.log('\n=== DKG Outputs ===');
      console.log(`MINTING_DWALLET_SECRET_KEY_SHARE=${secretKeyShareHex}`);
      console.log(`MINTING_DWALLET_PUBLIC_OUTPUT=${publicOutputHex}`);
      console.log(`MINTING_DWALLET_PUBKEY=${pubkeyHex}`);
      console.log(`MINTING_DWALLET_ID=${MINTING_DWALLET_ID}`);

      // Auto-update .env
      const envPath = '.env';
      if (existsSync(envPath)) {
        let envContent = readFileSync(envPath, 'utf-8');
        envContent = envContent.replace(
          /^MINTING_DWALLET_SECRET_KEY_SHARE=.*$/m,
          `MINTING_DWALLET_SECRET_KEY_SHARE=${secretKeyShareHex}`,
        );
        envContent = envContent.replace(
          /^MINTING_DWALLET_PUBLIC_OUTPUT=.*$/m,
          `MINTING_DWALLET_PUBLIC_OUTPUT=${publicOutputHex}`,
        );
        writeFileSync(envPath, envContent);
        console.log('\n.env updated automatically');
      }
    } else {
      console.log('Could not find DKG outputs in dWallet object');
      console.log('Available fields:', JSON.stringify(fields, null, 2));
    }
  }

  console.log('\n=== Minting dWallet Setup Complete ===');
}

main().catch(err => {
  console.error('Resume failed:', err);
  process.exit(1);
});
