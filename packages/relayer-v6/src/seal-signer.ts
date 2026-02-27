/**
 * Seal Signer — Core signing orchestrator for IKA dWallet 2PC-MPC.
 *
 * Bridges the gap between SealPending events and complete_seal:
 *
 *   1. Allocate presign from pool
 *   2. Compute centralized signature via IKA SDK WASM
 *   3. Call request_sign_seal on-chain (treasury-funded)
 *   4. Poll IKA for signature completion
 *   5. Call complete_seal on-chain with the IKA signature
 *
 * The minting dWallet's userSecretKeyShare and userPublicOutput must be
 * provided at construction (persisted from DKG). These are needed for
 * createUserSignMessageWithPublicOutput.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  IkaClient,
  Curve,
  Hash,
  SignatureAlgorithm,
  createUserSignMessageWithPublicOutput,
  parseSignatureFromSignOutput,
} from '@ika.xyz/sdk';
import type { IkaConfig } from '@ika.xyz/sdk';
import { PresignPool } from './presign-pool.js';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import type { SuiTxQueue } from './sui-tx-queue.js';
import type { SealPendingEvent, PresignEntry } from './types.js';

export class SealSigner {
  private readonly sui: SuiClient;
  private readonly ikaClient: IkaClient;
  private readonly ikaConfig: IkaConfig;
  private readonly keypair: Ed25519Keypair;
  private readonly presignPool: PresignPool;
  private readonly userSecretKeyShare: Uint8Array;
  private readonly userPublicOutput: Uint8Array;
  private readonly txQueue: SuiTxQueue;
  private protocolPublicParams: Uint8Array | null = null;

  constructor(
    sui: SuiClient,
    ikaClient: IkaClient,
    ikaConfig: IkaConfig,
    keypair: Ed25519Keypair,
    presignPool: PresignPool,
    userSecretKeyShare: Uint8Array,
    userPublicOutput: Uint8Array,
    txQueue: SuiTxQueue,
  ) {
    this.sui = sui;
    this.ikaClient = ikaClient;
    this.ikaConfig = ikaConfig;
    this.keypair = keypair;
    this.presignPool = presignPool;
    this.userSecretKeyShare = userSecretKeyShare;
    this.userPublicOutput = userPublicOutput;
    this.txQueue = txQueue;
  }

  /**
   * Full signing flow for a pending seal.
   *
   * Called when a SealPending event is received. Performs the complete
   * IKA 2PC-MPC signing ceremony and submits the result on-chain.
   */
  async signAndComplete(event: SealPendingEvent): Promise<void> {
    const vaaHashBytes = toBytes(event.vaa_hash);
    const vaaHashHex = bytesToHex(vaaHashBytes);
    const messageHash = toBytes(event.message_hash);

    logger.info({ vaaHash: vaaHashHex }, 'Starting signing flow for pending seal');

    // Retry with different presigns if one turns out to be stale/deleted
    const MAX_PRESIGN_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_PRESIGN_RETRIES; attempt++) {
      // 1. Allocate presign from pool
      const presign = this.presignPool.allocate(vaaHashHex);
      if (!presign) {
        throw new Error(`No presigns available for seal ${vaaHashHex}`);
      }

      try {
        await this.executeSigningFlow(vaaHashHex, messageHash, presign);
        return; // Success
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // If the presign object was deleted/invalid on-chain, evict it and retry
        if (errMsg.includes('deleted') || errMsg.includes('invalid')) {
          logger.warn(
            { presignObjectId: presign.objectId, attempt, err },
            'Presign object stale/deleted — evicting and retrying with next presign',
          );
          this.presignPool.markUsed(presign.objectId); // Remove from pool
          continue;
        }

        // For other errors, rethrow. The allocated presign will be auto-released
        // back to AVAILABLE after the 5-minute allocation TTL expires in the DB.
        throw err;
      }
    }

    throw new Error(`Failed to sign seal ${vaaHashHex} after ${MAX_PRESIGN_RETRIES} presign attempts (all stale)`);
  }

  /**
   * Execute the full signing flow with a specific presign.
   */
  private async executeSigningFlow(
    vaaHashHex: string,
    messageHash: Uint8Array,
    presign: PresignEntry,
  ): Promise<void> {
    // 2. Get protocol public parameters (cached)
    const protocolPublicParams = await this.getProtocolPublicParams();

    // 3. Generate centralized signature via IKA SDK WASM
    logger.info({ vaaHash: vaaHashHex }, 'Computing centralized signature');
    const centralizedSig = await createUserSignMessageWithPublicOutput(
      protocolPublicParams,
      this.userPublicOutput,
      this.userSecretKeyShare,
      presign.presignBcs,
      messageHash,
      Hash.SHA512,
      SignatureAlgorithm.EdDSA,
      Curve.ED25519,
    );

    // 4. Call request_sign_seal on-chain
    const signatureId = await this.requestSignOnChain(
      vaaHashHex,
      centralizedSig,
      presign.objectId,
    );

    logger.info({ vaaHash: vaaHashHex, signatureId }, 'Sign request submitted — polling IKA');

    // 5. Poll IKA for signature completion
    const signResult = await this.ikaClient.getSignInParticularState(
      signatureId,
      Curve.ED25519,
      SignatureAlgorithm.EdDSA,
      'Completed',
      { timeout: 120_000 },
    );

    // 6. Extract raw signature
    const signatureOutput = new Uint8Array(
      (signResult as { state: { Completed: { signature: number[] } } }).state.Completed.signature,
    );
    const signature = await parseSignatureFromSignOutput(
      Curve.ED25519,
      SignatureAlgorithm.EdDSA,
      signatureOutput,
    );

    logger.info(
      { vaaHash: vaaHashHex, signatureHex: Buffer.from(signature).toString('hex').slice(0, 32) + '...' },
      'IKA signature obtained',
    );

    // 7. Mark presign used and trigger async replenishment
    this.presignPool.markUsed(presign.objectId);
    this.presignPool.replenish(1).catch((err) =>
      logger.warn({ err }, 'Async presign replenish failed'),
    );

    // 8. Call complete_seal on-chain
    await this.completeSealOnChain(vaaHashHex, signature);

    logger.info({ vaaHash: vaaHashHex }, 'Seal signing flow complete — SealSigned event emitted');
  }

  /**
   * Get protocol public parameters (cached after first fetch).
   */
  private async getProtocolPublicParams(): Promise<Uint8Array> {
    if (!this.protocolPublicParams) {
      this.protocolPublicParams = await this.ikaClient.getProtocolPublicParameters(
        undefined,
        Curve.ED25519,
      );
    }
    return this.protocolPublicParams;
  }

  /**
   * Submit request_sign_seal transaction on-chain.
   * Returns the IKA signature_id from the SignRequested event.
   */
  private async requestSignOnChain(
    vaaHash: string,
    centralizedSig: Uint8Array,
    presignObjectId: string,
  ): Promise<string> {
    const config = getConfig();
    const coordinatorConfig = this.ikaConfig.objects.ikaDWalletCoordinator;

    const tx = new Transaction();
    const coordinatorRef = tx.sharedObjectRef({
      objectId: coordinatorConfig.objectID,
      initialSharedVersion: coordinatorConfig.initialSharedVersion,
      mutable: true,
    });

    tx.moveCall({
      target: `${config.suiPackageId}::orchestrator::request_sign_seal`,
      arguments: [
        tx.object(config.suiOrchestratorStateId),
        tx.object(config.suiSigningStateId),
        coordinatorRef,
        tx.object(config.suiAdminCapId),
        tx.pure.vector('u8', Array.from(hexToBytes(vaaHash))),
        tx.pure.vector('u8', Array.from(centralizedSig)),
        tx.object(presignObjectId),
        tx.pure.u64(Date.now()),
      ],
    });

    const result = await this.txQueue.enqueue('request_sign_seal', () =>
      this.sui.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
        options: { showEvents: true },
      }),
    );

    // Parse SignRequested event to get signature_id
    const signEvent = result.events?.find(
      (e) => e.type.includes('signing::SignRequested'),
    );

    if (!signEvent?.parsedJson) {
      throw new Error('SignRequested event not found in transaction');
    }

    const eventData = signEvent.parsedJson as {
      request: string;
      vaa_hash: number[];
      signature_id: string;
    };

    logger.info(
      { txDigest: result.digest, signatureId: eventData.signature_id },
      'request_sign_seal submitted',
    );

    return eventData.signature_id;
  }

  /**
   * Submit complete_seal transaction on-chain with the IKA signature.
   */
  private async completeSealOnChain(
    vaaHash: string,
    signature: Uint8Array,
  ): Promise<void> {
    const config = getConfig();

    const tx = new Transaction();
    tx.moveCall({
      target: `${config.suiPackageId}::orchestrator::complete_seal`,
      arguments: [
        tx.object(config.suiOrchestratorStateId),
        tx.object(config.suiRegistryObjectId),
        tx.object(config.suiMintingAuthorityId),
        tx.object(config.suiAdminCapId),
        tx.pure.vector('u8', Array.from(hexToBytes(vaaHash))),
        tx.pure.vector('u8', Array.from(signature)),
        tx.object('0x6'), // Clock shared object
      ],
    });

    const result = await this.txQueue.enqueue('complete_seal', () =>
      this.sui.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
      }),
    );

    logger.info(
      { txDigest: result.digest, vaaHash },
      'complete_seal submitted — SealSigned event emitted',
    );
  }
}

/**
 * Convert hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert Sui event vector<u8> fields to Uint8Array.
 * Sui SDK may return these as number[], base64 string, or hex string.
 */
function toBytes(value: number[] | string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  // Try base64 first (Sui CLI returns base64 for vector<u8>)
  if (typeof value === 'string') {
    if (value.startsWith('0x')) return hexToBytes(value);
    // Check if it looks like base64
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fall back to hex
      return hexToBytes(value);
    }
  }
  throw new Error(`Cannot convert to bytes: ${typeof value}`);
}
