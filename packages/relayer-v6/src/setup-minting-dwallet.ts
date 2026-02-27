/**
 * One-time setup script: Create the Ed25519 minting dWallet.
 *
 * Creates a shared Ed25519 dWallet for signing seal messages via the
 * orchestrator::create_minting_dwallet entry point, which stores the
 * DWalletCap permanently in the SigningState.
 *
 * Usage: npx tsx src/setup-minting-dwallet.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  IkaClient,
  UserShareEncryptionKeys,
  Curve,
  prepareDKGAsync,
  createRandomSessionIdentifier,
  publicKeyFromDWalletOutput,
} from '@ika.xyz/sdk';
import { getNetworkConfig } from '@ika.xyz/sdk';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { rateLimitSuiClient } from './rate-limited-sui-client.js';

dotenv.config();

async function main() {
  const config = {
    suiRpcUrl: process.env.SUI_RPC_URL!,
    suiPackageId: process.env.SUI_PACKAGE_ID!,
    suiKeypairPath: process.env.SUI_KEYPAIR_PATH!,
    suiSigningStateId: process.env.SUI_SIGNING_STATE_ID!,
    suiMintingAuthorityId: process.env.SUI_MINTING_AUTHORITY_ID!,
    suiAdminCapId: process.env.SUI_ADMIN_CAP_ID!,
    suiOrchestratorStateId: process.env.SUI_ORCHESTRATOR_STATE_ID!,
    ikaNetwork: (process.env.IKA_NETWORK || 'testnet') as 'testnet' | 'mainnet',
    ikaEncryptionSeed: process.env.IKA_ENCRYPTION_SEED!,
  };

  console.log('Creating Ed25519 minting dWallet via orchestrator...\n');

  const sui = rateLimitSuiClient(new SuiClient({ url: config.suiRpcUrl }));
  const suiKeypair = loadSuiKeypair(config.suiKeypairPath);
  const signerAddress = suiKeypair.getPublicKey().toSuiAddress();
  const ikaConfig = getNetworkConfig(config.ikaNetwork);
  const ikaClient = new IkaClient({ suiClient: sui, config: ikaConfig });
  await ikaClient.initialize();

  console.log('IKA client initialized');

  // Prepare DKG for Ed25519
  const seed = Uint8Array.from(Buffer.from(config.ikaEncryptionSeed, 'hex'));
  const userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(seed, Curve.ED25519);
  const identifier = createRandomSessionIdentifier();
  const dkgRequestInput = await prepareDKGAsync(
    ikaClient,
    Curve.ED25519,
    userShareEncryptionKeys,
    identifier,
    signerAddress,
  );

  console.log('DKG preparation complete');

  // Get network encryption key
  const networkEncryptionKey = await ikaClient.getLatestNetworkEncryptionKey();

  // Build PTB: orchestrator::create_minting_dwallet
  // This creates the dWallet AND stores DWalletCap in SigningState
  const tx = new Transaction();

  const coordinatorConfig = ikaConfig.objects.ikaDWalletCoordinator;
  const coordinatorRef = tx.sharedObjectRef({
    objectId: coordinatorConfig.objectID,
    initialSharedVersion: coordinatorConfig.initialSharedVersion,
    mutable: true,
  });

  tx.moveCall({
    target: `${config.suiPackageId}::orchestrator::create_minting_dwallet`,
    arguments: [
      tx.object(config.suiOrchestratorStateId),
      tx.object(config.suiSigningStateId),
      tx.object(config.suiAdminCapId),
      coordinatorRef,
      tx.pure.id(networkEncryptionKey.id),
      tx.pure.vector('u8', Array.from(dkgRequestInput.userDKGMessage)),
      tx.pure.vector('u8', Array.from(dkgRequestInput.userPublicOutput)),
      tx.pure.vector('u8', Array.from(dkgRequestInput.userSecretKeyShare)),
      tx.pure.vector('u8', Array.from(identifier)),
    ],
  });

  const txResult = await sui.signAndExecuteTransaction({
    transaction: tx,
    signer: suiKeypair,
    options: { showEvents: true, showObjectChanges: true },
  });

  console.log(`create_minting_dwallet tx: ${txResult.digest}`);

  // Parse MintingDWalletCreated event to get dWallet ID
  // (DWalletCap is wrapped inside SigningState, so it won't appear in objectChanges)
  const mintingEvent = txResult.events?.find(
    (e) => e.type.includes('MintingDWalletCreated') || e.type.includes('signing::MintingDWalletCreated'),
  );
  if (!mintingEvent?.parsedJson) {
    throw new Error('MintingDWalletCreated event not found');
  }
  const eventData = mintingEvent.parsedJson as { dwallet_cap_id: string; dwallet_id: string };
  const dwalletId = eventData.dwallet_id;
  console.log(`MintingDWalletCreated event:`);
  console.log(`  DWalletCap ID: ${eventData.dwallet_cap_id}`);
  console.log(`  dWallet ID: ${dwalletId}`);

  console.log(`\ndWallet ID: ${dwalletId}`);
  console.log('Waiting for Active state...');

  // Wait for Active state
  const activeDWallet = await ikaClient.getDWalletInParticularState(
    dwalletId, 'Active', { timeout: 120_000 },
  );

  const activeOutput = new Uint8Array(activeDWallet.state.Active!.public_output);
  const pubkey = await publicKeyFromDWalletOutput(Curve.ED25519, activeOutput);

  console.log('Minting dWallet Active!');
  console.log(`Ed25519 Public Key: ${Buffer.from(pubkey).toString('hex')}`);

  // Set minting pubkey on MintingAuthority
  console.log('\nSetting minting pubkey on MintingAuthority...');
  const pubkeyTx = new Transaction();
  pubkeyTx.moveCall({
    target: `${config.suiPackageId}::orchestrator::set_minting_pubkey`,
    arguments: [
      pubkeyTx.object(config.suiMintingAuthorityId),
      pubkeyTx.object(config.suiAdminCapId),
      pubkeyTx.pure.vector('u8', Array.from(pubkey)),
    ],
  });

  const pubkeyResult = await sui.signAndExecuteTransaction({
    transaction: pubkeyTx,
    signer: suiKeypair,
  });
  console.log(`set_minting_pubkey tx: ${pubkeyResult.digest}`);

  // Output env vars
  // IMPORTANT: MINTING_DWALLET_PUBLIC_OUTPUT must be the Active dWallet's
  // public_output (781 bytes for Ed25519), NOT the DKG userPublicOutput (232 bytes).
  // The WASM's createUserSignMessageWithPublicOutput expects the full Active output.
  const secretKeyShareHex = Buffer.from(dkgRequestInput.userSecretKeyShare).toString('hex');
  const activePublicOutputHex = Buffer.from(activeOutput).toString('hex');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Add these to your .env file:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`MINTING_DWALLET_ID=${dwalletId}`);
  console.log(`MINTING_DWALLET_SECRET_KEY_SHARE=${secretKeyShareHex}`);
  console.log(`MINTING_DWALLET_PUBLIC_OUTPUT=${activePublicOutputHex}`);
  console.log(`MINTING_DWALLET_PUBKEY=${Buffer.from(pubkey).toString('hex')}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

function loadSuiKeypair(path: string): Ed25519Keypair {
  const raw = readFileSync(path, 'utf-8').trim();
  if (raw.startsWith('[')) {
    const bytes = new Uint8Array(JSON.parse(raw));
    const seed = bytes.length === 64 ? bytes.slice(0, 32) : bytes;
    return Ed25519Keypair.fromSecretKey(seed);
  }
  return Ed25519Keypair.fromSecretKey(raw);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
