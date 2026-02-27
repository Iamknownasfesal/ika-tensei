/**
 * Configuration for Ika Tensei v7 Relayer
 *
 * Loads from environment variables with validation.
 * v7 adds: SUI_KEYPAIR_PATH (for Sui txs), API_PORT (for HTTP API).
 */

import { RelayerConfig, SourceChainEmitter } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'SUI_RPC_URL',
  'SUI_PACKAGE_ID',
  'SOLANA_RPC_URL',
  'SOLANA_PROGRAM_ID',
  'RELAYER_KEYPAIR_PATH',
  'SUI_KEYPAIR_PATH',
] as const;

/**
 * Validate all required environment variables are set
 */
function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter(
    (varName) => !process.env[varName]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Get relayer configuration from environment
 */
export function getConfig(): RelayerConfig {
  validateEnv();

  return {
    suiRpcUrl: process.env.SUI_RPC_URL!,
    suiPackageId: process.env.SUI_PACKAGE_ID!,
    suiOriginalPackageId: process.env.SUI_ORIGINAL_PACKAGE_ID || process.env.SUI_PACKAGE_ID!,
    solanaRpcUrl: process.env.SOLANA_RPC_URL!,
    solanaProgramId: process.env.SOLANA_PROGRAM_ID!,
    relayerKeypairPath: process.env.RELAYER_KEYPAIR_PATH!,
    suiKeypairPath: process.env.SUI_KEYPAIR_PATH!,
    ikaNetwork: (process.env.IKA_NETWORK || 'testnet') as 'testnet' | 'mainnet',
    ikaEncryptionSeed: process.env.IKA_ENCRYPTION_SEED || '',
    apiPort: parseInt(process.env.API_PORT || '3001', 10),
    sealFeeLamports: parseInt(process.env.SEAL_FEE_LAMPORTS || '10000000', 10), // 0.01 SOL default
    suiRegistryObjectId: process.env.SUI_REGISTRY_OBJECT_ID || '',
    suiRegistryCapObjectId: process.env.SUI_REGISTRY_CAP_OBJECT_ID || '',
    suiOrchestratorStateId: process.env.SUI_ORCHESTRATOR_STATE_ID || '',
    suiSigningStateId: process.env.SUI_SIGNING_STATE_ID || '',
    suiMintingAuthorityId: process.env.SUI_MINTING_AUTHORITY_ID || '',
    suiAdminCapId: process.env.SUI_ADMIN_CAP_ID || '',
    minIkaBalanceMist: BigInt(process.env.MIN_IKA_BALANCE_MIST || '50000000000'), // 50 IKA default
    minSuiBalanceMist: BigInt(process.env.MIN_SUI_BALANCE_MIST || '5000000000'),  // 5 SUI default
    presignPoolMinAvailable: parseInt(process.env.PRESIGN_POOL_MIN_AVAILABLE || '5', 10),
    presignPoolReplenishBatch: parseInt(process.env.PRESIGN_POOL_REPLENISH_BATCH || '5', 10),
    wormholescanApiUrl: process.env.WORMHOLESCAN_API_URL || 'https://api.testnet.wormholescan.io',
    wormholeStateObjectId: process.env.WORMHOLE_STATE_OBJECT_ID || '',
    sourceChainEmitters: parseEmitters(process.env.SOURCE_CHAIN_EMITTERS || ''),
    vaaPollingIntervalMs: parseInt(process.env.VAA_POLLING_INTERVAL_MS || '30000', 10),
    // Source chain RPCs (centralized flow)
    baseRpcUrl: process.env.BASE_RPC_URL || 'https://sepolia.base.org',
    aptosRpcUrl: process.env.APTOS_RPC_URL || 'https://fullnode.testnet.aptoslabs.com/v1',
    // Per-chain EVM RPC URLs (all fall back to baseRpcUrl if not set)
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || '',
    polygonRpcUrl: process.env.POLYGON_RPC_URL || '',
    arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL || '',
    optimismRpcUrl: process.env.OPTIMISM_RPC_URL || '',

    nearRpcUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',

    // Arweave via Irys
    irysPrivateKey: process.env.IRYS_PRIVATE_KEY || '',
    irysNetwork: (process.env.IRYS_NETWORK || 'devnet') as 'devnet' | 'mainnet',

    // Centralized flow toggle (VAA ingester disabled by default)
    enableVaaIngester: process.env.ENABLE_VAA_INGESTER === 'true',

    // Royalties on new collections (basis points, 500 = 5%)
    royaltyBasisPoints: parseInt(process.env.ROYALTY_BASIS_POINTS || '500', 10),

    // Core voter weight plugin for SPL Governance NFT voting
    coreVoterProgramId: process.env.CORE_VOTER_PROGRAM_ID || 'E5thJCWofTMbmyhUhCai3hZiruFtYmmscDio6GwFCGaW',

    // API security
    apiKey: process.env.RELAYER_API_KEY || '',
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || '',

    dbPath: process.env.DB_PATH || './relayer.db',
    healthPort: parseInt(process.env.HEALTH_PORT || '8080', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
  };
}

/**
 * Parse SOURCE_CHAIN_EMITTERS env var.
 * Format: "chainId:emitterAddress:label,chainId:emitterAddress:label,..."
 * Example: "2:000000000000000000000000abc123...:Ethereum,15:abc123...:NEAR"
 */
function parseEmitters(raw: string): SourceChainEmitter[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((entry) => {
    const [chainIdStr, emitterAddress, label] = entry.trim().split(':');
    return {
      chainId: parseInt(chainIdStr, 10),
      emitterAddress: emitterAddress.startsWith('0x')
        ? emitterAddress.slice(2)
        : emitterAddress,
      label: label || `Chain ${chainIdStr}`,
    };
  });
}

// All modules should use getConfig() instead of importing a static config object.
// This avoids eager evaluation at import time (which fails if .env isn't loaded yet).
