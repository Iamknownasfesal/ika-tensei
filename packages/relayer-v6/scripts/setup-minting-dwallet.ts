/**
 * Setup Minting dWallet — One-time admin script.
 *
 * Creates the shared minting dWallet via IKA DKG, stores the DWalletCap
 * in the SigningState contract, sets the minting pubkey on-chain,
 * and saves DKG outputs to .env.
 *
 * Usage:
 *   npx tsx scripts/setup-minting-dwallet.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import {
  IkaClient,
  UserShareEncryptionKeys,
  Curve,
  prepareDKGAsync,
  createRandomSessionIdentifier,
  publicKeyFromDWalletOutput,
  getNetworkConfig,
} from '@ika.xyz/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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
  const suiRpcUrl = process.env.SUI_RPC_URL!;
  const suiPackageId = process.env.SUI_PACKAGE_ID!;
  const suiKeypairPath = process.env.SUI_KEYPAIR_PATH || './sui-keypair.json';
  const ikaNetwork = (process.env.IKA_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const encryptionSeedHex = process.env.IKA_ENCRYPTION_SEED!;
  const orchestratorStateId = process.env.SUI_ORCHESTRATOR_STATE_ID!;
  const signingStateId = process.env.SUI_SIGNING_STATE_ID!;
  const adminCapId = process.env.SUI_ADMIN_CAP_ID!;
  const mintingAuthorityId = process.env.SUI_MINTING_AUTHORITY_ID!;

  // Validate required env vars
  const required = {
    SUI_RPC_URL: suiRpcUrl,
    SUI_PACKAGE_ID: suiPackageId,
    IKA_ENCRYPTION_SEED: encryptionSeedHex,
    SUI_ORCHESTRATOR_STATE_ID: orchestratorStateId,
    SUI_SIGNING_STATE_ID: signingStateId,
    SUI_ADMIN_CAP_ID: adminCapId,
    SUI_MINTING_AUTHORITY_ID: mintingAuthorityId,
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error('Missing required env vars:', missing.join(', '));
    process.exit(1);
  }

  console.log('=== Minting dWallet Setup ===');
  console.log('RPC:', suiRpcUrl);
  console.log('Package:', suiPackageId);
  console.log('IKA Network:', ikaNetwork);

  // Load Sui keypair
  const suiKeypair = loadSuiKeypair(suiKeypairPath);
  const signerAddress = suiKeypair.getPublicKey().toSuiAddress();
  console.log('Signer:', signerAddress);

  // Initialize clients
  const sui = new SuiClient({ url: suiRpcUrl });
  const ikaConfig = getNetworkConfig(ikaNetwork);
  const ikaClient = new IkaClient({ suiClient: sui, config: ikaConfig });
  await ikaClient.initialize();
  console.log('IKA client initialized');

  // Prepare encryption seed (32 bytes)
  const clean = encryptionSeedHex.startsWith('0x') ? encryptionSeedHex.slice(2) : encryptionSeedHex;
  const encryptionSeed = Uint8Array.from(Buffer.from(clean, 'hex'));
  if (encryptionSeed.length !== 32) {
    console.error('IKA_ENCRYPTION_SEED must be exactly 32 bytes (64 hex chars)');
    process.exit(1);
  }

  // Step 1: Prepare DKG for Ed25519 curve
  const curve = Curve.ED25519;
  const encryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(encryptionSeed, curve);
  console.log('Encryption keys created');

  const identifier = createRandomSessionIdentifier();
  const dkgInput = await prepareDKGAsync(ikaClient, curve, encryptionKeys, identifier, signerAddress);
  console.log('DKG preparation complete');
  console.log('  userDKGMessage:', dkgInput.userDKGMessage.length, 'bytes');
  console.log('  userPublicOutput:', dkgInput.userPublicOutput.length, 'bytes');
  console.log('  userSecretKeyShare:', dkgInput.userSecretKeyShare.length, 'bytes');

  // Step 2: Get network encryption key
  const networkEncKey = await ikaClient.getLatestNetworkEncryptionKey();
  console.log('Network encryption key ID:', networkEncKey.id);

  // Step 3: Build PTB calling orchestrator::create_minting_dwallet
  const tx = new Transaction();

  // DWalletCoordinator from IKA config (needs explicit sharedObjectRef)
  const coordinatorConfig = ikaConfig.objects.ikaDWalletCoordinator;
  const coordinatorRef = tx.sharedObjectRef({
    objectId: coordinatorConfig.objectID,
    initialSharedVersion: coordinatorConfig.initialSharedVersion,
    mutable: true,
  });

  tx.moveCall({
    target: `${suiPackageId}::orchestrator::create_minting_dwallet`,
    arguments: [
      tx.object(orchestratorStateId),    // OrchestratorState (shared, mutable)
      tx.object(signingStateId),          // SigningState (shared, mutable)
      tx.object(adminCapId),              // OrchestratorAdminCap (owned)
      coordinatorRef,                      // DWalletCoordinator (shared, mutable)
      tx.pure.id(networkEncKey.id),       // dwallet_network_encryption_key_id
      tx.pure.vector('u8', Array.from(dkgInput.userDKGMessage)),
      tx.pure.vector('u8', Array.from(dkgInput.userPublicOutput)),
      tx.pure.vector('u8', Array.from(dkgInput.userSecretKeyShare)),
      tx.pure.vector('u8', Array.from(identifier)),
    ],
  });

  console.log('\nSubmitting create_minting_dwallet transaction...');
  const result = await sui.signAndExecuteTransaction({
    transaction: tx,
    signer: suiKeypair,
    options: { showEvents: true, showObjectChanges: true },
  });

  console.log('TX digest:', result.digest);

  // Step 4: Parse MintingDWalletCreated event
  const mintingEvent = result.events?.find(e => e.type.includes('signing::MintingDWalletCreated'));
  if (!mintingEvent?.parsedJson) {
    console.error('MintingDWalletCreated event not found!');
    console.log('All events:', JSON.stringify(result.events, null, 2));
    process.exit(1);
  }

  const { dwallet_cap_id, dwallet_id } = mintingEvent.parsedJson as {
    dwallet_cap_id: string;
    dwallet_id: string;
  };
  console.log('Minting DWalletCap ID:', dwallet_cap_id);
  console.log('Minting dWallet ID:', dwallet_id);

  // Step 5: Poll for dWallet Active state
  console.log('\nPolling for dWallet Active state (timeout: 120s)...');
  const activeDWallet = await ikaClient.getDWalletInParticularState(
    dwallet_id,
    'Active',
    { timeout: 120_000 },
  );

  // Step 6: Extract public key
  const activeOutput = new Uint8Array(activeDWallet.state.Active!.public_output);
  const pubkey = await publicKeyFromDWalletOutput(curve, activeOutput);
  const pubkeyHex = Buffer.from(pubkey).toString('hex');
  console.log('Minting dWallet pubkey:', pubkeyHex);

  // Step 7: Set minting pubkey on Sui
  console.log('\nSetting minting pubkey on-chain...');
  const setPubkeyTx = new Transaction();
  setPubkeyTx.moveCall({
    target: `${suiPackageId}::orchestrator::set_minting_pubkey`,
    arguments: [
      setPubkeyTx.object(mintingAuthorityId),   // MintingAuthority (shared, mutable)
      setPubkeyTx.object(adminCapId),            // OrchestratorAdminCap (owned)
      setPubkeyTx.pure.vector('u8', Array.from(pubkey)),
    ],
  });

  const setPubkeyResult = await sui.signAndExecuteTransaction({
    transaction: setPubkeyTx,
    signer: suiKeypair,
  });
  console.log('set_minting_pubkey TX:', setPubkeyResult.digest);

  // Step 8: Save DKG outputs
  const secretKeyShareHex = Buffer.from(dkgInput.userSecretKeyShare).toString('hex');
  const publicOutputHex = Buffer.from(dkgInput.userPublicOutput).toString('hex');

  console.log('\n=== DKG Outputs (save these!) ===');
  console.log(`MINTING_DWALLET_SECRET_KEY_SHARE=${secretKeyShareHex}`);
  console.log(`MINTING_DWALLET_PUBLIC_OUTPUT=${publicOutputHex}`);
  console.log(`MINTING_DWALLET_PUBKEY=${pubkeyHex}`);
  console.log(`MINTING_DWALLET_ID=${dwallet_id}`);

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

  console.log('\n=== Minting dWallet Setup Complete ===');
  console.log('Next steps:');
  console.log('  1. Set minting pubkey on Solana: initialize_mint_config');
  console.log('  2. Restart the relayer to enable signing');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
