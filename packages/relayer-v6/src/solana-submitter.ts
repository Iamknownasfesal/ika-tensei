/**
 * Solana Submitter – builds and sends mint_reborn transactions.
 *
 * Critical fixes applied:
 *  1. Instruction encoding via Anchor Borsh discriminator (NOT custom binary).
 *  2. PDA derivation seeds match the on-chain program exactly.
 *  3. Ed25519 precompile instruction prepended to every transaction.
 *  4. New asset Keypair generated for every mint (Metaplex Core requirement).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import { getConfig } from './config.js';
import type { ProcessedSeal, SubmissionResult, PaymentVerificationResult } from './types.js';
import { logger } from './logger.js';

// Metaplex Core program ID (constant across all deployments)
const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

// ─── PDA seed constants (must match lib.rs exactly) ──────────────────────────
// NOTE: The old "used_signatures" global PDA no longer exists in the program.
// Replay protection now uses per-signature PDAs with seed ["sig_used", sig_hash].
const SEED_SIG_USED = Buffer.from('sig_used');
const SEED_PROVENANCE = Buffer.from('provenance');
const SEED_COLLECTION = Buffer.from('reborn_collection');
const SEED_MINT_AUTHORITY = Buffer.from('mint_authority');
const SEED_MINT_CONFIG = Buffer.from('mint_config');

// ─── Anchor instruction discriminator ─────────────────────────────────────────
/**
 * Compute the 8-byte Anchor instruction discriminator.
 * Anchor defines it as the first 8 bytes of SHA256("global:<instruction_name>").
 */
function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256')
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

const DISCRIMINATOR_MINT_REBORN = anchorDiscriminator('mint_reborn');
const DISCRIMINATOR_INIT_REBORN_COLLECTION = anchorDiscriminator('init_reborn_collection');

// ─── On-chain account parsing ────────────────────────────────────────────────

/**
 * Parse the collection_asset_address (Pubkey) from a RebornCollection PDA's
 * Borsh-encoded account data.
 *
 * RebornCollection layout:
 *   8          discriminator
 *   2          source_chain (u16)
 *   4 + N      nft_contract (Vec<u8>)
 *   4 + N      name (String)
 *   32         collection_asset_address (Pubkey)  ← we want this
 *   8          total_minted (u64)
 *   1          is_initialized (bool)
 *   1          bump (u8)
 */
function parseCollectionAssetAddress(data: Buffer): PublicKey | null {
  if (data.length < 8) return null;

  let offset = 8; // skip discriminator

  // source_chain: u16
  offset += 2;

  // nft_contract: Vec<u8> (4-byte LE length prefix + bytes)
  if (offset + 4 > data.length) return null;
  const contractLen = data.readUInt32LE(offset);
  offset += 4 + contractLen;

  // name: String (4-byte LE length prefix + UTF-8 bytes)
  if (offset + 4 > data.length) return null;
  const nameLen = data.readUInt32LE(offset);
  offset += 4 + nameLen;

  // collection_asset_address: Pubkey (32 bytes)
  if (offset + 32 > data.length) return null;
  return new PublicKey(data.subarray(offset, offset + 32));
}

// ─── Borsh encoding helpers ───────────────────────────────────────────────────

/**
 * Encode the mint_reborn instruction arguments using Borsh, which is what Anchor
 * expects on-chain.
 *
 * Layout (all integers are little-endian, params reordered so PDA-seed
 * params come first — this lets Anchor's #[instruction] skip deserializing
 * the large signature Vec in the try_accounts stack frame):
 *   [u8; 8]  – discriminator
 *   u32 + [] – sig_hash (Vec<u8>, 32 bytes, PDA seed)
 *   u16      – source_chain (PDA seed)
 *   u32 + [] – nft_contract (Vec<u8>, PDA seed)
 *   u32 + [] – token_id (Vec<u8>, PDA seed)
 *   u32 + [] – signature (Vec<u8>, 64 bytes, NOT a PDA seed)
 *   u32 + [] – token_uri (String)
 *   u32 + [] – collection_name (String)
 *   u16      – royalty_basis_points
 *   [u8; 32] – dao_treasury (Pubkey)
 *
 * NOTE: dwallet_pubkey is NOT included — it's loaded from the MintConfig PDA on-chain.
 */
function encodeMintRebornArgs(
  sigHash: Uint8Array,
  sourceChain: number,
  nftContract: Uint8Array,
  tokenId: Uint8Array,
  signature: Uint8Array,
  tokenUri: string,
  collectionName: string,
  royaltyBasisPoints: number,
  daoTreasury: Uint8Array,
): Buffer {
  if (signature.length !== 64) throw new Error('signature must be 64 bytes');
  if (sigHash.length !== 32) throw new Error('sigHash must be 32 bytes');
  if (daoTreasury.length !== 32) throw new Error('daoTreasury must be 32 bytes');

  const tokenUriBytes = Buffer.from(tokenUri, 'utf-8');
  const collectionNameBytes = Buffer.from(collectionName, 'utf-8');

  const totalLen =
    8 +   // discriminator
    4 + sigHash.length +           // sig_hash Vec<u8>
    2 +   // source_chain u16
    4 + nftContract.length +      // Vec<u8>
    4 + tokenId.length +           // Vec<u8>
    4 + signature.length +         // signature Vec<u8>
    4 + tokenUriBytes.length +     // String
    4 + collectionNameBytes.length + // String
    2 +   // royalty_basis_points u16
    32;   // dao_treasury Pubkey

  const buf = Buffer.alloc(totalLen);
  let offset = 0;

  // 1. Discriminator
  DISCRIMINATOR_MINT_REBORN.copy(buf, offset);
  offset += 8;

  // 2. sig_hash: Vec<u8> (SHA256 of signature, PDA seed)
  buf.writeUInt32LE(sigHash.length, offset);
  offset += 4;
  buf.set(sigHash, offset);
  offset += sigHash.length;

  // 3. source_chain: u16 LE (PDA seed)
  buf.writeUInt16LE(sourceChain, offset);
  offset += 2;

  // 4. nft_contract: Vec<u8> (PDA seed)
  buf.writeUInt32LE(nftContract.length, offset);
  offset += 4;
  buf.set(nftContract, offset);
  offset += nftContract.length;

  // 5. token_id: Vec<u8> (PDA seed)
  buf.writeUInt32LE(tokenId.length, offset);
  offset += 4;
  buf.set(tokenId, offset);
  offset += tokenId.length;

  // 6. signature: Vec<u8> (NOT a PDA seed — placed after PDA params)
  buf.writeUInt32LE(signature.length, offset);
  offset += 4;
  buf.set(signature, offset);
  offset += signature.length;

  // 7. token_uri: String
  buf.writeUInt32LE(tokenUriBytes.length, offset);
  offset += 4;
  tokenUriBytes.copy(buf, offset);
  offset += tokenUriBytes.length;

  // 8. collection_name: String
  buf.writeUInt32LE(collectionNameBytes.length, offset);
  offset += 4;
  collectionNameBytes.copy(buf, offset);
  offset += collectionNameBytes.length;

  // 9. royalty_basis_points: u16 LE
  buf.writeUInt16LE(royaltyBasisPoints, offset);
  offset += 2;

  // 10. dao_treasury: Pubkey (32 bytes, raw)
  buf.set(daoTreasury, offset);
  // offset += 32; // not needed — last field

  return buf;
}

/**
 * Encode the init_reborn_collection instruction arguments.
 * Layout: discriminator + source_chain(u16) + nft_contract(Vec<u8>)
 */
function encodeInitRebornCollectionArgs(
  sourceChain: number,
  nftContract: Uint8Array,
): Buffer {
  const totalLen = 8 + 2 + 4 + nftContract.length;
  const buf = Buffer.alloc(totalLen);
  let offset = 0;

  DISCRIMINATOR_INIT_REBORN_COLLECTION.copy(buf, offset);
  offset += 8;

  buf.writeUInt16LE(sourceChain, offset);
  offset += 2;

  buf.writeUInt32LE(nftContract.length, offset);
  offset += 4;
  buf.set(nftContract, offset);

  return buf;
}

// ─── SolanaSubmitter ──────────────────────────────────────────────────────────

export class SolanaSubmitter {
  private readonly connection: Connection;
  private readonly programId: PublicKey;

  constructor() {
    const config = getConfig();
    this.connection = new Connection(config.solanaRpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60_000,
    });
    this.programId = new PublicKey(config.solanaProgramId);
  }

  /** Verify Solana RPC is reachable. */
  async checkConnection(): Promise<boolean> {
    try {
      await this.connection.getVersion();
      return true;
    } catch (err) {
      logger.error({ err }, 'Solana connection check failed');
      return false;
    }
  }

  /**
   * Verify a SOL payment transaction on-chain.
   *
   * Checks:
   * - Transaction exists and succeeded
   * - Contains a system program transfer instruction
   * - Source matches expectedSender, destination matches expectedReceiver
   * - Lamports transferred >= requiredAmount
   */
  async verifyPayment(
    txSignature: string,
    expectedSender: string,
    expectedReceiver: string,
    requiredLamports: number,
  ): Promise<PaymentVerificationResult> {
    try {
      const tx = await this.connection.getParsedTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return { verified: false, error: 'Transaction not found' };
      }

      if (tx.meta?.err) {
        return { verified: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
      }

      // Reject payments older than 10 minutes to prevent replay of stale transactions
      if (tx.blockTime) {
        const age = Math.floor(Date.now() / 1000) - tx.blockTime;
        if (age > 600) {
          return { verified: false, error: 'Payment transaction too old (>10 minutes)' };
        }
      }

      // Search for a system program transfer instruction matching our criteria
      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (!('parsed' in ix)) continue;
        if (ix.program !== 'system' || ix.parsed?.type !== 'transfer') continue;

        const info = ix.parsed.info;
        if (
          info.source === expectedSender &&
          info.destination === expectedReceiver &&
          info.lamports >= requiredLamports
        ) {
          logger.info(
            { txSignature, lamports: info.lamports, sender: expectedSender },
            'Payment verified',
          );
          return { verified: true, actualLamports: info.lamports };
        }
      }

      return { verified: false, error: 'No matching transfer instruction found' };
    } catch (err) {
      logger.error({ err, txSignature }, 'Payment verification failed');
      return {
        verified: false,
        error: err instanceof Error ? err.message : 'Verification error',
      };
    }
  }

  /**
   * Build and send the mint_reborn transaction with exponential-backoff retries.
   *
   * A fresh asset Keypair is generated for every call (Metaplex Core requires
   * the asset account to be a new, uninitialized keypair and a co-signer).
   */
  async submitMintReborn(
    seal: ProcessedSeal,
    relayerKeypair: Keypair,
  ): Promise<SubmissionResult> {
    const config = getConfig();
    let retries = 0;

    while (retries <= config.maxRetries) {
      try {
        // Generate a fresh asset keypair for each attempt
        const assetKeypair = Keypair.generate();

        const { txHash, isNewCollection, collectionAssetAddress } = await this.sendTransaction(seal, relayerKeypair, assetKeypair);

        logger.info(
          { txHash, retries, receiver: Buffer.from(seal.receiver).toString('hex'), isNewCollection },
          'mint_reborn submitted successfully',
        );

        return { success: true, txHash, retries, assetAddress: assetKeypair.publicKey.toBase58(), isNewCollection, collectionAssetAddress };
      } catch (err) {
        retries++;

        if (retries <= config.maxRetries) {
          const delayMs = config.retryDelayMs * Math.pow(2, retries - 1);
          logger.warn(
            { err, attempt: retries, maxRetries: config.maxRetries, delayMs },
            'Transient error, retrying…',
          );
          await sleep(delayMs);
        } else {
          logger.error(
            { err, retries },
            'Max retries exceeded',
          );
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            retries,
          };
        }
      }
    }

    return { success: false, error: 'Unexpected loop exit', retries };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async sendTransaction(
    seal: ProcessedSeal,
    relayerKeypair: Keypair,
    assetKeypair: Keypair,
  ): Promise<{ txHash: string; isNewCollection: boolean; collectionAssetAddress?: string }> {
    const {
      signature,
      dwalletPubkey,
      sourceChain,
      nftContract,
      tokenId,
      tokenUri,
      collectionName,
      receiver,
      messageHash,
    } = seal;

    // ── 1. Derive PDAs ────────────────────────────────────────────────────────
    const sourceChainBuf = Buffer.alloc(2);
    sourceChainBuf.writeUInt16LE(sourceChain);

    // Compute sig_hash = SHA256(signature) for replay PDA
    const sigHash = createHash('sha256').update(signature).digest();

    // Per-signature replay protection PDA: ["sig_used", sha256(signature)]
    const [sigRecordPda] = PublicKey.findProgramAddressSync(
      [SEED_SIG_USED, sigHash],
      this.programId,
    );

    const [provenancePda] = PublicKey.findProgramAddressSync(
      [SEED_PROVENANCE, sourceChainBuf, Buffer.from(nftContract), Buffer.from(tokenId)],
      this.programId,
    );

    const [collectionPda] = PublicKey.findProgramAddressSync(
      [SEED_COLLECTION, sourceChainBuf, Buffer.from(nftContract)],
      this.programId,
    );

    const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
      [SEED_MINT_AUTHORITY, sourceChainBuf, Buffer.from(nftContract)],
      this.programId,
    );

    // MintConfig PDA — stores the shared minting dWallet pubkey on-chain
    const [mintConfigPda] = PublicKey.findProgramAddressSync(
      [SEED_MINT_CONFIG],
      this.programId,
    );

    // ── 2. Receiver public key ────────────────────────────────────────────────
    const receiverPubkey = new PublicKey(receiver);

    // ── 3. Determine collection_asset account ────────────────────────────────
    // The collection PDA (our program's metadata) is different from the Metaplex
    // Core collection_asset. On the first mint for a source collection, we generate
    // a new keypair for collection_asset (Metaplex Core creates it via CPI).
    // On subsequent mints, we read the stored collection_asset_address from the
    // RebornCollection PDA and pass it as a non-signer.
    let collectionAssetPubkey: PublicKey;
    let collectionAssetKeypair: Keypair | null = null;

    const collectionAccountInfo = await this.connection.getAccountInfo(collectionPda);
    if (collectionAccountInfo && collectionAccountInfo.data.length > 8) {
      // Collection PDA exists — parse stored collection_asset_address
      const storedAddress = parseCollectionAssetAddress(collectionAccountInfo.data);
      if (storedAddress && !storedAddress.equals(PublicKey.default)) {
        // Existing collection: use the stored Metaplex Core collection asset
        collectionAssetPubkey = storedAddress;
        logger.info(
          { collectionAsset: storedAddress.toBase58() },
          'Using existing collection asset',
        );
      } else {
        // PDA exists but collection_asset_address is zero/default — first mint
        collectionAssetKeypair = Keypair.generate();
        collectionAssetPubkey = collectionAssetKeypair.publicKey;
        logger.info(
          { collectionAsset: collectionAssetPubkey.toBase58() },
          'Generating new collection asset keypair (first mint)',
        );
      }
    } else {
      // Collection PDA doesn't exist yet — first mint for this source collection.
      // We'll call init_reborn_collection before mint_reborn in the same tx.
      collectionAssetKeypair = Keypair.generate();
      collectionAssetPubkey = collectionAssetKeypair.publicKey;
      logger.info(
        { collectionAsset: collectionAssetPubkey.toBase58() },
        'Generating new collection asset keypair (new collection)',
      );
    }

    // If collection PDA doesn't exist, create it first via init_reborn_collection
    const needsCollectionInit = !collectionAccountInfo || collectionAccountInfo.data.length <= 8;

    // ── 4. Build Ed25519 pre-instruction ─────────────────────────────────────
    // The Solana program reads the Ed25519 instruction at index 0 from the
    // instructions sysvar to verify the dWallet signature.
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: dwalletPubkey,   // 32-byte Ed25519 public key
      message: messageHash,        // 32-byte SHA256 message hash
      signature: signature,        // 64-byte Ed25519 signature
    });

    // ── 5. Encode Borsh instruction data ──────────────────────────────────────
    // NOTE: dwallet_pubkey is NOT included — loaded from MintConfig PDA on-chain
    const royaltyBasisPoints = getConfig().royaltyBasisPoints;
    const ixData = encodeMintRebornArgs(
      sigHash,
      sourceChain,
      nftContract,
      tokenId,
      signature,
      tokenUri,
      collectionName,
      royaltyBasisPoints,
      seal.daoTreasury,
    );

    // ── 6. Build mint_reborn instruction ─────────────────────────────────────
    const isFirstMint = collectionAssetKeypair !== null;
    const mintRebornIx = {
      programId: this.programId,
      keys: [
        { pubkey: relayerKeypair.publicKey, isSigner: true,  isWritable: true  }, // payer
        { pubkey: receiverPubkey,           isSigner: false, isWritable: false }, // receiver
        { pubkey: sigRecordPda,             isSigner: false, isWritable: true  }, // sig_record (per-sig replay PDA)
        { pubkey: provenancePda,            isSigner: false, isWritable: true  }, // provenance
        { pubkey: collectionPda,            isSigner: false, isWritable: true  }, // collection (program metadata PDA)
        { pubkey: mintAuthorityPda,         isSigner: false, isWritable: false }, // mint_authority (PDA signer for CPIs)
        { pubkey: collectionAssetPubkey,    isSigner: isFirstMint, isWritable: true }, // collection_asset (Metaplex Core collection)
        { pubkey: assetKeypair.publicKey,   isSigner: true,  isWritable: true  }, // asset
        { pubkey: MPL_CORE_PROGRAM_ID,      isSigner: false, isWritable: false }, // mpl_core_program
        { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false }, // system_program
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false }, // instructions_sysvar
        { pubkey: mintConfigPda,            isSigner: false, isWritable: false }, // config (MintConfig PDA)
      ],
      data: ixData,
    };

    // ── 7. Assemble transaction ──────────────────────────────────────────────
    // Order: Ed25519 verify (index 0) → [init_reborn_collection if needed] → mint_reborn
    const transaction = new Transaction();
    transaction.add(ed25519Ix);   // index 0 → program reads this for verification

    if (needsCollectionInit) {
      // Init the RebornCollection PDA before minting (same tx for atomicity)
      const initCollectionIx = {
        programId: this.programId,
        keys: [
          { pubkey: collectionPda,            isSigner: false, isWritable: true  }, // collection
          { pubkey: relayerKeypair.publicKey,  isSigner: true,  isWritable: true  }, // payer
          { pubkey: mintConfigPda,            isSigner: false, isWritable: false }, // config (MintConfig PDA for admin check)
          { pubkey: SystemProgram.programId,   isSigner: false, isWritable: false }, // system_program
        ],
        data: encodeInitRebornCollectionArgs(sourceChain, nftContract),
      };
      transaction.add(initCollectionIx);
      logger.info('Added init_reborn_collection instruction to transaction');
    }

    transaction.add(mintRebornIx);

    // ── 8. Sign and send ─────────────────────────────────────────────────────
    transaction.feePayer = relayerKeypair.publicKey;
    transaction.recentBlockhash = (
      await this.connection.getLatestBlockhash('confirmed')
    ).blockhash;

    // Sign with relayer (pays fees) + asset (new NFT keypair)
    transaction.partialSign(relayerKeypair);
    transaction.partialSign(assetKeypair);

    // On first mint, the collection_asset keypair must also sign
    if (collectionAssetKeypair) {
      transaction.partialSign(collectionAssetKeypair);
    }

    const rawTx = transaction.serialize();
    const txHash = await this.connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Wait for on-chain confirmation
    const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
    await this.connection.confirmTransaction(
      {
        signature: txHash,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed',
    );

    return {
      txHash,
      isNewCollection: isFirstMint,
      collectionAssetAddress: isFirstMint ? collectionAssetPubkey.toBase58() : undefined,
    };
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
