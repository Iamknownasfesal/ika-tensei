/**
 * Types for Ika Tensei v7 Relayer
 *
 * Shared types matching the Sui contract events, Solana program instructions,
 * and the relayer API for dWallet creation.
 *
 * All binary data from Sui events arrives as hex strings; ProcessedSeal converts
 * them to Uint8Array for use in Solana transactions.
 */

// ─── Sui Events ──────────────────────────────────────────────────────────────

/**
 * SealSigned event emitted by the Sui Orchestrator contract.
 * The relayer subscribes to these events and bridges them to Solana.
 *
 * Sui SDK returns Move vector<u8> fields as number[] in parsedJson.
 * Fields may also arrive as hex strings depending on SDK version.
 */
export interface SealSignedEvent {
  /** Source chain ID (e.g. 1 = Ethereum, 2 = BNB Chain) */
  source_chain: number;
  /** NFT contract address on the source chain (vector<u8>) */
  nft_contract: number[] | string;
  /** Token ID (vector<u8>) */
  token_id: number[] | string;
  /** UTF-8 token URI (vector<u8>) */
  token_uri: number[] | string;
  /** 32-byte Solana public key of the NFT receiver (vector<u8>) */
  receiver: number[] | string;
  /** Deposit address (vector<u8>) */
  deposit_address: number[] | string;
  /** 32-byte SHA256 message hash that was signed (vector<u8>) */
  message_hash: number[] | string;
  /** 64-byte Ed25519 signature from the IKA dWallet (vector<u8>) */
  signature: number[] | string;
  /** 32-byte Ed25519 public key of the IKA dWallet (vector<u8>) */
  dwallet_pubkey: number[] | string;
  /** VAA hash from Wormhole (vector<u8>) */
  vaa_hash: number[] | string;
  /** Unix timestamp of the seal event */
  timestamp: number | string;
}

/**
 * SealPending event emitted by the Sui Orchestrator contract.
 * The relayer subscribes to these events and triggers the signing flow.
 */
export interface SealPendingEvent {
  /** VAA hash (Sui SDK returns vector<u8> as number[] or base64 string) */
  vaa_hash: number[] | string;
  /** Source chain ID */
  source_chain: number;
  /** Deposit address (Sui SDK returns vector<u8> as number[] or base64 string) */
  deposit_address: number[] | string;
  /** Solana receiver pubkey (Sui SDK returns vector<u8> as number[] or base64 string) */
  receiver: number[] | string;
  /** SHA256 message hash to be signed (Sui SDK returns vector<u8> as number[] or base64 string) */
  message_hash: number[] | string;
  /** Unix timestamp (string from Sui) */
  timestamp: string | number;
}

// ─── Processed Data ──────────────────────────────────────────────────────────

/**
 * Parsed and processed seal data, ready for Solana submission.
 * All binary data is decoded from hex into Uint8Array/number.
 */
export interface ProcessedSeal {
  /** 64-byte Ed25519 signature from the IKA dWallet */
  signature: Uint8Array;
  /** 32-byte Ed25519 public key of the IKA dWallet (NOT deposit_address) */
  dwalletPubkey: Uint8Array;
  /** Source chain ID */
  sourceChain: number;
  /** Raw NFT contract bytes */
  nftContract: Uint8Array;
  /** Raw token ID bytes */
  tokenId: Uint8Array;
  /** Decoded UTF-8 token URI string */
  tokenUri: string;
  /** 32-byte Solana public key of the NFT receiver */
  receiver: Uint8Array;
  /** Reborn collection name derived on-chain */
  collectionName: string;
  /** 32-byte SHA256 message hash */
  messageHash: Uint8Array;
  /** 32-byte Solana public key of the DAO treasury (royalty recipient) */
  daoTreasury: Uint8Array;
}

// ─── API Types (v7: dWallet creation with SOL payment gate) ─────────────────

/**
 * Request to start a seal — initiates a payment session.
 */
export interface StartSealRequest {
  /** User's Solana wallet address (receiver of the reborn NFT) */
  solanaWallet: string;
  /** Source chain identifier (e.g. "ethereum", "polygon", "sui", "near") */
  sourceChain: string;
}

/**
 * Response from seal start — session ID and payment details.
 */
export interface StartSealResponse {
  /** Unique session ID (UUID) for this seal request */
  sessionId: string;
  /** Solana address to send SOL payment to */
  paymentAddress: string;
  /** Required payment amount in lamports */
  feeAmountLamports: number;
}

/**
 * Request to confirm payment and trigger dWallet creation.
 */
export interface ConfirmPaymentRequest {
  /** Session ID from /api/seal/start */
  sessionId: string;
  /** Solana transaction signature of the SOL payment */
  paymentTxSignature: string;
}

/**
 * Request to confirm NFT deposit (centralized flow).
 * The relayer verifies the deposit on the source chain via RPC.
 */
export interface ConfirmDepositRequest {
  /** Session ID from /api/seal/start */
  sessionId: string;
  /** NFT contract address (EVM hex, Sui type name, NEAR account, Aptos address) */
  nftContract: string;
  /** Token ID (EVM uint256, Sui object ID, NEAR string, Aptos object address) */
  tokenId: string;
  /** Optional: deposit transaction hash for faster verification */
  txHash?: string;
}

/**
 * Result of verifying a SOL payment transaction on-chain.
 */
export interface PaymentVerificationResult {
  /** Whether the payment was verified successfully */
  verified: boolean;
  /** Error message if verification failed */
  error?: string;
  /** Actual lamports transferred (for logging/debugging) */
  actualLamports?: number;
}

/**
 * Status of a seal in progress.
 */
export type SealStatusValue =
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'creating_dwallet'
  | 'waiting_deposit'
  | 'verifying_deposit'
  | 'uploading_metadata'
  | 'creating_seal'
  | 'detected'
  | 'verifying_vaa'
  | 'signing'
  | 'minting'
  | 'complete'
  | 'error';

/**
 * Response from seal status polling.
 */
export interface SealStatusResponse {
  sessionId: string;
  dwalletId?: string;
  status: SealStatusValue;
  depositAddress?: string;
  rebornNFT?: {
    mint: string;
    name: string;
    image: string;
  };
  error?: string;
}

/**
 * Internal tracking of a seal session (stored in-memory by the relayer).
 */
export interface SealSession {
  sessionId: string;
  solanaWallet: string;
  sourceChain: string;
  status: SealStatusValue;
  createdAt: number;
  /** Set after dWallet creation */
  dwalletId?: string;
  /** Set after dWallet creation */
  depositAddress?: string;
  /** Set after dWallet creation */
  dwalletPubkey?: Uint8Array;
  /** SOL payment tx signature (set after confirm-payment) */
  paymentTxSignature?: string;
  /** Timestamp when payment was verified */
  paymentVerifiedAt?: number;
  /** NFT contract address on source chain (set after confirm-deposit) */
  nftContract?: string;
  /** Token ID on source chain (set after confirm-deposit) */
  tokenId?: string;
  /** Arweave metadata URI (set after metadata upload) */
  tokenUri?: string;
  /** Deposit transaction hash (set after confirm-deposit) */
  depositTxHash?: string;
  /** NFT name from source chain metadata (set after verification) */
  nftName?: string;
  /** Collection name from source chain metadata (set after verification) */
  collectionName?: string;
  rebornNFT?: { mint: string; name: string; image: string };
  error?: string;
}

/**
 * Created dWallet from IKA SDK.
 */
export interface CreatedDWallet {
  /** dWallet ID on Sui */
  id: string;
  /** Ed25519 public key (32 bytes) */
  pubkey: Uint8Array;
  /** Chain-specific deposit address */
  depositAddress: string;
  /** DKG user secret key share (needed for createUserSignMessageWithPublicOutput) */
  userSecretKeyShare: Uint8Array;
  /** DKG user public output (needed for createUserSignMessageWithPublicOutput) */
  userPublicOutput: Uint8Array;
}

// ─── Presign Pool ────────────────────────────────────────────────────────────

/**
 * A presign cap entry in the in-memory pool.
 */
export interface PresignEntry {
  /** Sui object ID of the UnverifiedPresignCap */
  objectId: string;
  /** IKA presign ID (for polling completion) */
  presignId: string;
  /** BCS bytes of the presign (needed for createUserSignMessage) */
  presignBcs: Uint8Array;
  /** Current status */
  status: 'AVAILABLE' | 'ALLOCATED' | 'USED';
  /** Timestamp when allocated */
  allocatedAt?: number;
  /** VAA hash this presign is allocated for */
  allocatedFor?: string;
}

/**
 * Presign pool statistics.
 */
export interface PresignPoolStats {
  available: number;
  allocated: number;
  used: number;
  total: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Relayer configuration (loaded from environment variables).
 */
export interface RelayerConfig {
  // Sui
  suiRpcUrl: string;
  suiPackageId: string;
  /** Original package ID from first publish — used for event type filtering
   *  (Sui events always reference the original defining package, not upgrades) */
  suiOriginalPackageId: string;

  // Solana
  solanaRpcUrl: string;
  solanaProgramId: string;

  // Relayer keypair file path
  relayerKeypairPath: string;

  // Sui keypair for transactions (dWallet creation, VAA submission)
  suiKeypairPath: string;

  // IKA network ('testnet' | 'mainnet')
  ikaNetwork: 'testnet' | 'mainnet';

  // 32-byte hex seed for IKA UserShareEncryptionKeys (keep secret!)
  ikaEncryptionSeed: string;

  // API server
  apiPort: number;

  // Payment gate
  sealFeeLamports: number;

  // Sui DWalletRegistry object IDs (optional — validated at call time)
  suiRegistryObjectId: string;
  suiRegistryCapObjectId: string;

  // Sui shared object IDs for signing flow
  suiOrchestratorStateId: string;
  suiSigningStateId: string;
  suiMintingAuthorityId: string;
  suiAdminCapId: string;

  // Treasury minimum balances (in MIST)
  minIkaBalanceMist: bigint;
  minSuiBalanceMist: bigint;

  // Presign pool tuning
  presignPoolMinAvailable: number;
  presignPoolReplenishBatch: number;

  // VAA ingestion
  wormholescanApiUrl: string;
  wormholeStateObjectId: string;
  sourceChainEmitters: SourceChainEmitter[];
  vaaPollingIntervalMs: number;

  // Source chain RPCs (centralized flow)
  baseRpcUrl: string;
  ethereumRpcUrl: string;
  polygonRpcUrl: string;
  arbitrumRpcUrl: string;
  optimismRpcUrl: string;
  aptosRpcUrl: string;
  nearRpcUrl: string;

  // Arweave uploads via Irys
  irysPrivateKey: string;
  irysNetwork: 'devnet' | 'mainnet';

  // Centralized flow toggle
  enableVaaIngester: boolean;

  // Database
  dbPath: string;

  // Royalties
  royaltyBasisPoints: number;

  // Core voter weight plugin program ID (for SPL Governance NFT voting)
  coreVoterProgramId: string;

  // API security
  apiKey: string;
  corsAllowedOrigins: string;

  // Optional tuning
  healthPort: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Result of a Solana transaction submission attempt.
 */
export interface SubmissionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  retries: number;
  assetAddress?: string;
  /** True if this mint created a new Metaplex Core collection */
  isNewCollection?: boolean;
  /** Address of the Metaplex Core collection asset (set on first mint) */
  collectionAssetAddress?: string;
}

/**
 * Health check response shape.
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: number;
  suiConnected: boolean;
  solanaConnected: boolean;
  lastProcessedEvent?: string;
  eventsProcessed: number;
  eventsFailed: number;
}

/**
 * Persisted event cursor so the relayer can replay missed events on restart.
 */
export interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

// ─── VAA Ingestion ──────────────────────────────────────────────────────────

/**
 * A registered source chain emitter (SealInitiator contract).
 * The relayer polls Wormholescan for VAAs from these emitters.
 */
export interface SourceChainEmitter {
  /** Wormhole chain ID (e.g. 2 = Ethereum, 15 = NEAR, 22 = Aptos) */
  chainId: number;
  /** 32-byte hex emitter address (left-padded for EVM, hashed for NEAR) */
  emitterAddress: string;
  /** Human-readable label for logging */
  label: string;
}

/**
 * VAA entry from Wormholescan API response.
 */
export interface WormholescanVAAEntry {
  /** Unique VAA ID: chainId/emitterAddress/sequence */
  id: string;
  /** Wormhole chain ID of the emitter */
  emitterChain: number;
  /** Hex-encoded emitter address */
  emitterAddr: string;
  /** Sequence number */
  sequence: string;
  /** Base64-encoded signed VAA bytes */
  vaa: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Wormholescan API response for /api/v1/vaas endpoint.
 */
export interface WormholescanVAAResponse {
  data: WormholescanVAAEntry[];
}

/**
 * Persisted state for the VAA ingester (tracks last-seen sequence per emitter).
 */
export interface VAAIngesterState {
  /** Map of "chainId:emitterAddress" → last processed sequence number */
  lastSequences: Record<string, string>;
}
