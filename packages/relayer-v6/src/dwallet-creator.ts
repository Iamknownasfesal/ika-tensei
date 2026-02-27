/**
 * dWallet Creator — Creates shared deposit dWallets on Sui via IKA SDK.
 *
 * v7: Shared dWallet flow (public user secret key share on-chain).
 * The relayer creates a new IKA dWallet for each seal request by calling
 * our custom dwallet_factory::create_shared_dwallet Move function,
 * which wraps the IKA coordinator's DKG-with-public-share.
 *
 * Flow:
 *   1. Prepare DKG cryptographic data (WASM — prepareDKGAsync)
 *   2. Get network encryption key ID
 *   3. Build PTB calling ikatensei::dwallet_factory::create_shared_dwallet
 *   4. Poll until dWallet reaches Active state (no AwaitingKeyHolder step)
 *   5. Extract public key from dWallet output
 */

import { SuiClient } from '@mysten/sui/client';
import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  IkaClient,
  UserShareEncryptionKeys,
  Curve,
  prepareDKGAsync,
  createRandomSessionIdentifier,
  publicKeyFromDWalletOutput,
} from '@ika.xyz/sdk';
import type { IkaConfig } from '@ika.xyz/sdk';
import { getNetworkConfig } from '@ika.xyz/sdk';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { rateLimitSuiClient } from './rate-limited-sui-client.js';
import type { CreatedDWallet } from './types.js';

// Chain family mapping for address derivation
const EVM_CHAINS = new Set([
  'ethereum', 'polygon', 'arbitrum', 'base', 'optimism',
  'avalanche', 'bsc', 'fantom', 'moonbeam', 'celo',
  'scroll', 'blast', 'linea', 'gnosis',
]);

const ED25519_CHAINS = new Set(['sui', 'solana', 'aptos', 'near']);

// IKA Curve string → u32 mapping for Move contracts.
// Curve enum in @ika.xyz/sdk is string-valued ("SECP256K1", "ED25519", etc.),
// but the IKA coordinator expects u32 IDs.
const CURVE_TO_U32: Record<string, number> = {
  [Curve.SECP256K1]: 0,
  [Curve.SECP256R1]: 1,
  [Curve.ED25519]: 2,
  [Curve.RISTRETTO]: 3,
};

function curveToU32(curve: typeof Curve[keyof typeof Curve]): number {
  const id = CURVE_TO_U32[curve];
  if (id === undefined) throw new Error(`Unknown IKA curve: ${curve}`);
  return id;
}

// Map source chain to IKA Curve
function curveForChain(sourceChain: string): typeof Curve[keyof typeof Curve] {
  const chain = sourceChain.toLowerCase();
  if (EVM_CHAINS.has(chain)) return Curve.SECP256K1;
  if (ED25519_CHAINS.has(chain)) return Curve.ED25519;
  throw new Error(`Unsupported source chain: ${sourceChain}`);
}

export class DWalletCreator {
  private readonly sui: SuiClient;
  private readonly suiKeypair: Ed25519Keypair;
  private readonly ikaClient: IkaClient;
  private readonly ikaConfig: IkaConfig;
  private readonly encryptionSeed: Uint8Array;
  private initialized = false;

  constructor() {
    const config = getConfig();
    this.sui = rateLimitSuiClient(new SuiClient({ url: config.suiRpcUrl }));
    this.suiKeypair = this.loadSuiKeypair(config.suiKeypairPath);
    this.ikaConfig = getNetworkConfig(config.ikaNetwork);
    this.ikaClient = new IkaClient({
      suiClient: this.sui,
      config: this.ikaConfig,
    });

    // Derive 32-byte encryption seed from config or generate one
    if (config.ikaEncryptionSeed) {
      const clean = config.ikaEncryptionSeed.startsWith('0x')
        ? config.ikaEncryptionSeed.slice(2)
        : config.ikaEncryptionSeed;
      this.encryptionSeed = Uint8Array.from(Buffer.from(clean, 'hex'));
      if (this.encryptionSeed.length !== 32) {
        throw new Error('IKA_ENCRYPTION_SEED must be exactly 32 bytes (64 hex chars)');
      }
    } else {
      this.encryptionSeed = randomBytes(32);
      logger.warn('No IKA_ENCRYPTION_SEED set — using random seed (dWallets non-recoverable)');
    }
  }

  /**
   * Load the Sui Ed25519 keypair from file.
   * Supports two formats:
   *   1. JSON array of bytes (e.g. [1, 2, 3, ...] — 32 or 64 bytes)
   *   2. Bech32-encoded secret key string (e.g. "suiprivkey1...")
   */
  private loadSuiKeypair(path: string): Ed25519Keypair {
    try {
      const raw = readFileSync(path, 'utf-8').trim();

      // Try JSON array format first
      if (raw.startsWith('[')) {
        const bytes = new Uint8Array(JSON.parse(raw));
        // If 64 bytes, it's secretKey+pubkey — take first 32
        const seed = bytes.length === 64 ? bytes.slice(0, 32) : bytes;
        return Ed25519Keypair.fromSecretKey(seed);
      }

      // Bech32 format (suiprivkey1...)
      return Ed25519Keypair.fromSecretKey(raw);
    } catch (err) {
      logger.error({ path, err }, 'Failed to load Sui keypair');
      throw new Error(`Could not load Sui keypair from ${path}`);
    }
  }

  /**
   * Ensure IkaClient is initialized (fetches coordinator + system objects).
   * Called once lazily.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.ikaClient.initialize();
      this.initialized = true;
      logger.info('IKA client initialized');
    }
  }

  /**
   * Create a new deposit dWallet for a seal session.
   *
   * 1. Creates shared dWallet on Sui via our Move contract + IKA DKG
   * 2. Derives chain-specific deposit address from dWallet pubkey
   * 3. Registers in Sui DWalletRegistry
   * 4. Returns dWallet ID + deposit address
   */
  async create(sourceChain: string): Promise<CreatedDWallet> {
    logger.info({ sourceChain }, 'Creating deposit dWallet');

    const curve = curveForChain(sourceChain);

    // Step 1: Create shared dWallet via our Move contract
    const { id, capObjectId, pubkey, userSecretKeyShare, userPublicOutput } = await this.createSharedDWallet(curve);

    // Step 2: Derive chain-specific deposit address
    const depositAddress = this.deriveDepositAddress(sourceChain, pubkey);

    // Step 3: Register in Sui DWalletRegistry (stores the DWalletCap in the registry)
    await this.registerInRegistry(capObjectId, pubkey, depositAddress);

    logger.info(
      { dwalletId: id, depositAddress, sourceChain },
      'Deposit dWallet created and registered',
    );

    return { id, pubkey, depositAddress, userSecretKeyShare, userPublicOutput };
  }

  /**
   * Create a shared dWallet via our dwallet_factory Move contract.
   *
   * Shared dWallet = user secret key share is public on-chain.
   * No encryption key registration needed, no acceptEncryptedUserShare step.
   * dWallet goes straight to Active after DKG completes.
   *
   * Flow:
   *   1. Prepare DKG inputs via WASM (prepareDKGAsync)
   *   2. Get network encryption key ID
   *   3. Build PTB calling dwallet_factory::create_shared_dwallet
   *   4. Poll directly for Active state
   *   5. Extract public key from dWallet output
   */
  private async createSharedDWallet(curve: typeof Curve[keyof typeof Curve]): Promise<{
    id: string;
    capObjectId: string;
    pubkey: Uint8Array;
    userSecretKeyShare: Uint8Array;
    userPublicOutput: Uint8Array;
  }> {
    await this.ensureInitialized();

    const config = getConfig();
    const signerAddress = this.suiKeypair.getPublicKey().toSuiAddress();

    // 1. Create encryption keys (still needed for prepareDKGAsync WASM)
    const userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(
      this.encryptionSeed,
      curve,
    );

    // 2. Prepare DKG cryptographic data
    const identifier = createRandomSessionIdentifier();
    const dkgRequestInput = await prepareDKGAsync(
      this.ikaClient,
      curve,
      userShareEncryptionKeys,
      identifier,
      signerAddress,
    );

    logger.info('DKG preparation complete');

    // 3. Get network encryption key
    const networkEncryptionKey = await this.ikaClient.getLatestNetworkEncryptionKey();

    // 4. Build PTB calling our dwallet_factory::create_shared_dwallet
    const tx = new Transaction();

    // Coordinator shared object — from IKA network config
    const coordinatorConfig = this.ikaConfig.objects.ikaDWalletCoordinator;
    const coordinatorRef = tx.sharedObjectRef({
      objectId: coordinatorConfig.objectID,
      initialSharedVersion: coordinatorConfig.initialSharedVersion,
      mutable: true,
    });

    // IKA coin from sender's balance (NOT from gas — gas is SUI)
    const ikaPackageId = this.ikaConfig.packages.ikaPackage;
    const ikaCoin = tx.add(
      coinWithBalance({ type: `${ikaPackageId}::ika::IKA`, balance: 10_000_000_000 }),
    );

    // SUI coin split from gas
    const [suiCoin] = tx.splitCoins(tx.gas, [1_000_000_000]);

    const [dwalletCap] = tx.moveCall({
      target: `${config.suiPackageId}::dwallet_factory::create_shared_dwallet`,
      arguments: [
        coordinatorRef,
        tx.pure.id(networkEncryptionKey.id),
        tx.pure.u32(curveToU32(curve)),
        tx.pure.vector('u8', Array.from(dkgRequestInput.userDKGMessage)),
        tx.pure.vector('u8', Array.from(dkgRequestInput.userPublicOutput)),
        tx.pure.vector('u8', Array.from(dkgRequestInput.userSecretKeyShare)),
        tx.pure.vector('u8', Array.from(identifier)),
        ikaCoin,
        suiCoin,
      ],
    });

    // Transfer DWalletCap and remaining coins back to the signer
    tx.transferObjects([dwalletCap, ikaCoin, suiCoin], signerAddress);

    const txResult = await this.sui.signAndExecuteTransaction({
      transaction: tx,
      signer: this.suiKeypair,
      options: { showObjectChanges: true },
    });

    logger.info({ txDigest: txResult.digest }, 'Shared DKG transaction submitted');

    // 5. Extract dWallet ID from DWalletCap in objectChanges
    const dwalletCapChange = txResult.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('DWalletCap'),
    );

    if (!dwalletCapChange || dwalletCapChange.type !== 'created') {
      throw new Error('DWalletCap not found in transaction results');
    }

    // Small delay to let Sui RPC index the newly created object
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Read the DWalletCap object to get dwallet_id (retry if RPC hasn't indexed yet)
    let capObject = await this.sui.getObject({
      id: dwalletCapChange.objectId,
      options: { showContent: true },
    });
    let capContent = capObject.data?.content;
    if (capContent?.dataType !== 'moveObject') {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      capObject = await this.sui.getObject({
        id: dwalletCapChange.objectId,
        options: { showContent: true },
      });
      capContent = capObject.data?.content;
    }
    if (capContent?.dataType !== 'moveObject') {
      throw new Error('Failed to read DWalletCap content');
    }
    const dwalletId = (capContent.fields as Record<string, unknown>).dwallet_id as string;

    logger.info({ dwalletId }, 'Shared DKG submitted — waiting for Active state');

    // 6. Poll directly for Active state (shared dWallets skip AwaitingKeyHolderSignature)
    const activeDWallet = await this.ikaClient.getDWalletInParticularState(
      dwalletId,
      'Active',
      { timeout: 120_000 },
    );

    // 7. Extract public key from the active dWallet output
    const activeOutput = new Uint8Array(activeDWallet.state.Active!.public_output);
    const pubkey = await publicKeyFromDWalletOutput(curve, activeOutput);

    logger.info(
      { dwalletId, pubkeyHex: Buffer.from(pubkey).toString('hex') },
      'Shared dWallet is Active — public key extracted',
    );

    return {
      id: dwalletId,
      capObjectId: dwalletCapChange.objectId,
      pubkey,
      userSecretKeyShare: new Uint8Array(dkgRequestInput.userSecretKeyShare),
      userPublicOutput: new Uint8Array(dkgRequestInput.userPublicOutput),
    };
  }

  /**
   * Derive a chain-specific deposit address from the dWallet's pubkey.
   *
   * - EVM chains: keccak256(secp256k1_pubkey)[12:] → 20-byte address → hex with 0x prefix
   * - Ed25519 chains (Sui, Solana, NEAR): pubkey is the address directly
   *
   * NOTE: For EVM chains, the IKA dWallet will have a secp256k1 key.
   * For Ed25519 chains, the dWallet will have an Ed25519 key.
   * The curve is selected automatically based on the source chain.
   */
  deriveDepositAddress(sourceChain: string, pubkey: Uint8Array): string {
    const chain = sourceChain.toLowerCase();

    if (EVM_CHAINS.has(chain)) {
      // EVM: keccak256(uncompressed_pubkey_64_bytes)[12:]
      // IKA returns compressed secp256k1 key (33 bytes, 02/03 prefix).
      // Ethereum requires: decompress → strip 04 prefix → keccak256 → last 20 bytes.
      const point = secp256k1.ProjectivePoint.fromHex(pubkey);
      const uncompressed = point.toRawBytes(false); // 65 bytes (04 + X + Y)
      const pubkeyNoPrefix = uncompressed.subarray(1); // 64 bytes (X + Y)
      const hash = keccak_256(pubkeyNoPrefix);
      const address = hash.subarray(12, 32);
      return '0x' + Buffer.from(address).toString('hex');
    }

    if (ED25519_CHAINS.has(chain)) {
      // Ed25519 chains: pubkey IS the address
      // Sui addresses use 0x prefix; NEAR implicit accounts don't
      const hex = Buffer.from(pubkey).toString('hex');
      return chain === 'near' ? hex : `0x${hex}`;
    }

    throw new Error(`Unsupported source chain: ${sourceChain}`);
  }

  /**
   * Register the dWallet in the Sui DWalletRegistry contract.
   *
   * The DWalletCap object is passed by object ID — the Move function takes
   * it by value, transferring ownership from the relayer into the registry.
   * After this call, the registry holds the cap permanently.
   */
  private async registerInRegistry(
    capObjectId: string,
    pubkey: Uint8Array,
    depositAddress: string,
  ): Promise<void> {
    const config = getConfig();

    if (!config.suiRegistryObjectId || !config.suiRegistryCapObjectId) {
      logger.warn(
        { capObjectId },
        'Registry object IDs not configured — skipping DWalletRegistry registration',
      );
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.suiPackageId}::dwallet_registry::register_dwallet`,
        arguments: [
          tx.object(config.suiRegistryObjectId),
          tx.object(config.suiRegistryCapObjectId),
          tx.pure.vector('u8', Buffer.from(depositAddress.replace(/^0x/, ''), 'hex')),
          tx.pure.vector('u8', Array.from(pubkey)),
          tx.object(capObjectId), // DWalletCap — consumed by the registry
        ],
      });

      const result = await this.sui.signAndExecuteTransaction({
        transaction: tx,
        signer: this.suiKeypair,
      });

      logger.info(
        { capObjectId, depositAddress, txDigest: result.digest },
        'dWallet registered in DWalletRegistry (cap stored in registry)',
      );
    } catch (err) {
      logger.error({ err, capObjectId }, 'Failed to register dWallet in registry');
      throw err;
    }
  }
}
