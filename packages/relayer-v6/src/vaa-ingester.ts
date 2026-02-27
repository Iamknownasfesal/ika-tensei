/**
 * VAA Ingester — Polls Wormholescan for signed VAAs and submits them to Sui.
 *
 * Closes the gap between source chain SealInitiator events and the Sui
 * orchestrator's process_vaa() entry point.
 *
 * Flow:
 *   1. Poll Wormholescan API for new VAAs from registered emitters
 *   2. Filter out already-processed VAAs (tracked locally + checked on-chain)
 *   3. Decode VAA to extract deposit_address → look up dWallet in registry
 *   4. Submit process_vaa() on Sui for each new VAA
 *   5. SealPending event fires → picked up by existing SealSigner flow
 *
 * Supports EVM chains (real Wormhole VAAs) and NEAR (real Wormhole VAAs).
 * Aptos is currently event-only (no real VAA) — see seal_initiator.move.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { getAllVaaSequences, saveVaaSequence } from './db.js';
import type { SuiTxQueue } from './sui-tx-queue.js';
import type {
  SourceChainEmitter,
  WormholescanVAAEntry,
  WormholescanVAAResponse,
} from './types.js';

export class VAAIngester {
  private readonly sui: SuiClient;
  private readonly keypair: Ed25519Keypair;
  private readonly txQueue: SuiTxQueue;
  private readonly emitters: SourceChainEmitter[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  /** "chainId:emitterAddress" → last processed sequence (string to handle u64) */
  private lastSequences: Map<string, string>;

  /** Set of VAA IDs currently being processed (prevents duplicate submissions) */
  private readonly inflight = new Set<string>();

  constructor(sui: SuiClient, keypair: Ed25519Keypair, txQueue: SuiTxQueue) {
    this.sui = sui;
    this.keypair = keypair;
    this.txQueue = txQueue;
    const config = getConfig();
    this.emitters = config.sourceChainEmitters;
    this.lastSequences = getAllVaaSequences();
    logger.info({ entries: this.lastSequences.size }, 'Loaded VAA ingester state');
  }

  /**
   * Start polling Wormholescan for new VAAs.
   */
  async start(): Promise<void> {
    if (this.emitters.length === 0) {
      logger.warn('No source chain emitters configured — VAA ingester disabled');
      return;
    }

    logger.info(
      { emitters: this.emitters.map((e) => `${e.label}(${e.chainId})`) },
      'Starting VAA ingester',
    );

    // Initial poll
    await this.pollAll();

    // Schedule recurring polls
    const config = getConfig();
    this.timer = setInterval(() => {
      this.pollAll().catch((err) => {
        logger.error({ err }, 'VAA polling cycle failed');
      });
    }, config.vaaPollingIntervalMs);

    this._isRunning = true;
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._isRunning = false;
    logger.info('VAA ingester stopped');
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Poll all registered emitters for new VAAs.
   */
  private async pollAll(): Promise<void> {
    for (const emitter of this.emitters) {
      try {
        await this.pollEmitter(emitter);
      } catch (err) {
        logger.error(
          { err, chainId: emitter.chainId, label: emitter.label },
          'Failed to poll emitter',
        );
      }
    }
  }

  /**
   * Poll a single emitter for new VAAs from Wormholescan.
   */
  private async pollEmitter(emitter: SourceChainEmitter): Promise<void> {
    const config = getConfig();
    const emitterKey = `${emitter.chainId}:${emitter.emitterAddress}`;
    const lastSeq = this.lastSequences.get(emitterKey);

    // Build Wormholescan URL
    // GET /api/v1/vaas/:chain/:emitter?sortOrder=ASC&page=0&pageSize=50
    const baseUrl = config.wormholescanApiUrl.replace(/\/$/, '');
    const url = new URL(
      `${baseUrl}/api/v1/vaas/${emitter.chainId}/${emitter.emitterAddress}`,
    );
    url.searchParams.set('sortOrder', 'ASC');
    url.searchParams.set('pageSize', '50');

    logger.debug(
      { url: url.toString(), lastSeq, label: emitter.label },
      'Polling Wormholescan',
    );

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Wormholescan API error: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as WormholescanVAAResponse;
    if (!body.data || body.data.length === 0) {
      logger.debug({ label: emitter.label }, 'No new VAAs');
      return;
    }

    // Filter to VAAs after lastSeq
    let newVAAs = body.data;
    if (lastSeq !== undefined) {
      newVAAs = newVAAs.filter(
        (v) => BigInt(v.sequence) > BigInt(lastSeq),
      );
    }

    if (newVAAs.length === 0) {
      return;
    }

    logger.info(
      { count: newVAAs.length, label: emitter.label },
      'Found new VAAs to process',
    );

    for (const vaaEntry of newVAAs) {
      await this.processVAAEntry(vaaEntry, emitter);
    }
  }

  /**
   * Process a single VAA entry: decode, look up dWallet, submit to Sui.
   */
  private async processVAAEntry(
    entry: WormholescanVAAEntry,
    emitter: SourceChainEmitter,
  ): Promise<void> {
    const vaaId = `${emitter.chainId}/${emitter.emitterAddress}/${entry.sequence}`;

    // Skip if already processing
    if (this.inflight.has(vaaId)) {
      return;
    }

    this.inflight.add(vaaId);

    try {
      // Decode base64 VAA to bytes
      const vaaBytes = base64ToBytes(entry.vaa);

      // Extract deposit_address from the payload to look up the dWallet ID.
      // Wormhole VAA structure: header (variable) → payload
      // Our payload: [0] type, [1-2] chain, [3-34] nft_contract, [35-66] token_id,
      //              [67-98] deposit_address, [99-130] receiver, [131+] uri
      //
      // We need to find the payload within the VAA. The full VAA format is:
      //   [0]       version (1 byte)
      //   [1-4]     guardian set index (4 bytes)
      //   [5]       num signatures (1 byte)
      //   [6+]      signatures (66 bytes each: guardian_index(1) + r(32) + s(32) + v(1))
      //   After sigs: timestamp(4) + nonce(4) + emitter_chain(2) + emitter_address(32) +
      //               sequence(8) + consistency_level(1) + payload(...)
      const numSignatures = vaaBytes[5];
      const signaturesEnd = 6 + numSignatures * 66;
      // Body starts at signaturesEnd
      // timestamp(4) + nonce(4) + emitter_chain(2) + emitter_address(32) + sequence(8) + consistency(1)
      const payloadStart = signaturesEnd + 4 + 4 + 2 + 32 + 8 + 1;
      const payload = vaaBytes.slice(payloadStart);

      // Extract deposit_address from payload bytes [67-98] (32 bytes, Wormhole left-padded)
      const depositAddressRaw = payload.slice(67, 99);

      // Extract source_chain from payload bytes [1-2] (uint16 BE)
      const sourceChainId = (payload[1] << 8) | payload[2];

      // EVM chains use 20-byte addresses left-padded to 32 bytes in Wormhole.
      // Strip the 12-byte zero padding for EVM chains so the registry key matches.
      // Wormhole EVM chain IDs: 2=Ethereum, 4=BSC, 5=Polygon, 6=Avalanche,
      // 10=Fantom, 23=Arbitrum, 24=Optimism, 30=Base, 10002=EthSepolia,
      // 10004=BaseSepolia, 10005=OptSepolia, etc.
      const isEVM = [2, 4, 5, 6, 10, 23, 24, 30, 10002, 10003, 10004, 10005, 10006].includes(sourceChainId);
      const depositAddressBytes = isEVM ? depositAddressRaw.slice(12) : depositAddressRaw;
      const depositAddressHex = bytesToHex(depositAddressBytes);

      // Look up dWallet ID from on-chain registry
      const dwalletId = await this.lookupDWalletId(depositAddressHex);
      if (!dwalletId) {
        logger.warn(
          { vaaId, depositAddress: depositAddressHex },
          'No registered dWallet for deposit address — skipping VAA',
        );
        this.updateLastSequence(emitter, entry.sequence);
        return;
      }

      // Check if already processed on-chain
      const alreadyProcessed = await this.isVAAProcessedOnChain(vaaBytes);
      if (alreadyProcessed) {
        logger.debug({ vaaId }, 'VAA already processed on-chain — skipping');
        this.updateLastSequence(emitter, entry.sequence);
        return;
      }

      // Submit process_vaa to Sui
      await this.submitProcessVAA(vaaBytes, dwalletId);

      logger.info({ vaaId, depositAddress: depositAddressHex }, 'VAA submitted to Sui');
      this.updateLastSequence(emitter, entry.sequence);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // MoveAbort errors are non-retriable (dWallet already used, VAA already processed, etc.)
      // Advance the sequence so we don't retry this VAA forever.
      if (errMsg.includes('MoveAbort')) {
        logger.warn(
          { err, vaaId },
          'VAA processing failed with non-retriable MoveAbort — skipping',
        );
        this.updateLastSequence(emitter, entry.sequence);
      } else {
        logger.error({ err, vaaId }, 'Failed to process VAA entry — will retry');
      }
    } finally {
      this.inflight.delete(vaaId);
    }
  }

  /**
   * Look up the dWallet ID for a deposit address from the on-chain registry.
   * Returns the dWallet object ID or null if not registered.
   */
  private async lookupDWalletId(depositAddressHex: string): Promise<string | null> {
    const config = getConfig();

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.suiPackageId}::dwallet_registry::get_dwallet_id`,
        arguments: [
          tx.object(config.suiRegistryObjectId),
          tx.pure.vector('u8', Array.from(hexToBytes(depositAddressHex))),
        ],
      });

      const result = await this.sui.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: this.keypair.getPublicKey().toSuiAddress(),
      });

      if (result.results?.[0]?.returnValues?.[0]) {
        const [bytes] = result.results[0].returnValues[0];
        // Return values from devInspect are BCS-encoded.
        // vector<u8> BCS: ULEB128(length) + data.
        // For 32-byte IDs, the first byte is 0x20 (32) = the vector length.
        // Skip the ULEB128 length prefix to get the raw ID bytes.
        const rawBytes = new Uint8Array(bytes as number[]);
        // Simple ULEB128 decode: for lengths < 128, it's a single byte
        const vecLen = rawBytes[0];
        const idBytes = rawBytes.slice(1, 1 + vecLen);
        return '0x' + bytesToHex(idBytes);
      }
    } catch {
      // Not registered — devInspect will abort on assert
      return null;
    }

    return null;
  }

  /**
   * Check if a VAA has already been processed on the Sui orchestrator.
   * Best-effort: relies on the contract's E_VAA_ALREADY_USED replay protection
   * if this check fails or returns a false negative.
   */
  private async isVAAProcessedOnChain(_vaaBytes: Uint8Array): Promise<boolean> {
    // The on-chain replay protection (E_VAA_ALREADY_USED) handles duplicates.
    // A more precise check would compute the VAA digest and call is_vaa_processed
    // via devInspect, but the Wormhole digest is double-keccak256 of the body
    // which requires a keccak256 implementation. For now, let the contract reject.
    return false;
  }

  /**
   * Submit process_vaa() to the Sui orchestrator.
   */
  private async submitProcessVAA(
    vaaBytes: Uint8Array,
    dwalletId: string,
  ): Promise<string> {
    const config = getConfig();

    const tx = new Transaction();
    tx.moveCall({
      target: `${config.suiPackageId}::orchestrator::process_vaa`,
      arguments: [
        tx.object(config.suiOrchestratorStateId),
        tx.object(config.suiAdminCapId), // AdminCap — required after audit fix
        tx.object(config.wormholeStateObjectId),
        tx.object(config.suiRegistryObjectId),
        tx.pure.vector('u8', Array.from(vaaBytes)),
        tx.pure.id(dwalletId),
        tx.object('0x6'), // Clock
      ],
    });

    const result = await this.txQueue.enqueue('process_vaa', () =>
      this.sui.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
        options: { showEvents: true },
      }),
    );

    logger.info(
      { txDigest: result.digest },
      'process_vaa transaction submitted',
    );

    return result.digest;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private updateLastSequence(emitter: SourceChainEmitter, sequence: string): void {
    const key = `${emitter.chainId}:${emitter.emitterAddress}`;
    this.lastSequences.set(key, sequence);
    saveVaaSequence(key, sequence);
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
