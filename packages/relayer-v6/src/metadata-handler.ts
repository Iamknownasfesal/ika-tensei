/**
 * Metadata Handler — Fetches, transforms, and uploads NFT metadata.
 *
 * Flow:
 *   1. Fetch metadata from source chain (tokenURI, Sui Display, NEAR metadata)
 *   2. Transform to Metaplex-compatible JSON standard
 *   3. Upload image + metadata JSON to Arweave via Irys
 *   4. Return final Arweave metadata URI for use in Solana minting
 */

import Irys from '@irys/sdk';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import type { VerifyResult } from './chain-verifier.js';

// Maximum image size: 10 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Validate a URL is safe to fetch (SSRF protection).
 * Rejects private/internal IPs and non-HTTPS URLs (unless IPFS/Arweave gateway).
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http(s) protocols
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Block private/internal hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return false;
    if (hostname === '::1' || hostname === '[::1]') return false;
    // Block IPv4 private ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (hostname.startsWith('172.') && /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return false;
    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) return false;
    // Block IPv6 private/link-local (fc00::/7, fe80::/10)
    if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe8')) return false;
    if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe8')) return false;
    // Block internal TLDs
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.localhost')) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProvenanceData {
  source_chain: string;
  source_chain_id: number;
  source_contract: string;
  source_token_id: string;
  bridge_method: string;
  deposit_address: string;
  bridged_at: string;
}

export interface MetaplexMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  properties: {
    category: string;
    creators: Array<{ address: string; share: number }>;
    files: Array<{ uri: string; type: string }>;
  };
  ika_tensei?: ProvenanceData;
}

interface RawMetadata {
  name?: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
  external_url?: string;
  animation_url?: string;
}

// ─── Metadata Handler ───────────────────────────────────────────────────────

export class MetadataHandler {
  private irys: Irys | null = null;

  /** Returns the correct gateway URL based on Irys network config. */
  private get gatewayUrl(): string {
    const config = getConfig();
    return config.irysNetwork === 'devnet'
      ? 'https://devnet.irys.xyz'
      : 'https://arweave.net';
  }

  /**
   * Full pipeline: fetch source metadata → transform → upload to Arweave.
   * Returns the final Arweave metadata URI for the Solana NFT.
   */
  async processAndUpload(
    sourceChain: string,
    verifyResult: VerifyResult,
    nftName: string,
    collectionName: string,
    receiverWallet: string,
    provenanceInfo?: {
      sourceContract: string;
      sourceTokenId: string;
      depositAddress: string;
      sourceChainId: number;
    },
  ): Promise<{ metadataUri: string; imageUrl: string }> {
    // 1. Fetch raw metadata from source
    const raw = await this.fetchSourceMetadata(sourceChain, verifyResult);

    // 2. Build provenance data
    let provenance: ProvenanceData | undefined;
    if (provenanceInfo) {
      provenance = {
        source_chain: sourceChain,
        source_chain_id: provenanceInfo.sourceChainId,
        source_contract: provenanceInfo.sourceContract,
        source_token_id: provenanceInfo.sourceTokenId,
        bridge_method: 'ika-2pc-mpc',
        deposit_address: provenanceInfo.depositAddress,
        bridged_at: new Date().toISOString(),
      };
    }

    // 3. Transform to Metaplex standard
    const metadata = this.transformToMetaplex(raw, nftName, collectionName, receiverWallet, provenance);
    const originalImage = metadata.image || verifyResult.imageUrl || '';

    // 4. Upload to Arweave (or fallback if Irys not configured)
    const config = getConfig();
    if (!config.irysPrivateKey) {
      logger.warn('IRYS_PRIVATE_KEY not set — skipping Arweave upload, using source tokenURI');
      if (verifyResult.tokenUri) {
        return { metadataUri: verifyResult.tokenUri, imageUrl: originalImage };
      }
      return { metadataUri: metadata.image || 'https://arweave.net/placeholder', imageUrl: originalImage };
    }

    const metadataUri = await this.uploadToArweave(metadata);
    // After uploadToArweave, metadata.image has been replaced with the Arweave image URL
    return { metadataUri, imageUrl: metadata.image || originalImage };
  }

  /**
   * Fetch metadata from the source chain.
   * Uses tokenURI (EVM/Aptos/NEAR) or Display data (Sui).
   */
  async fetchSourceMetadata(
    _sourceChain: string,
    verifyResult: VerifyResult,
  ): Promise<RawMetadata> {
    const raw: RawMetadata = {};

    // Use name/image/description from verification if available (Sui Display, NEAR metadata)
    if (verifyResult.name) raw.name = verifyResult.name;
    if (verifyResult.imageUrl) raw.imageUrl = verifyResult.imageUrl;
    if (verifyResult.description) raw.description = verifyResult.description;

    // If there's a tokenURI, fetch it for full metadata
    if (verifyResult.tokenUri) {
      try {
        const fetched = await this.fetchMetadataFromUri(verifyResult.tokenUri);
        if (fetched) {
          // Merge: fetched data takes precedence for fields it has
          if (fetched.name) raw.name = fetched.name;
          if (fetched.description) raw.description = fetched.description;
          if (fetched.image) raw.image = fetched.image;
          if (fetched.attributes) raw.attributes = fetched.attributes;
          if (fetched.external_url) raw.external_url = fetched.external_url;
          if (fetched.animation_url) raw.animation_url = fetched.animation_url;
        }
      } catch (err) {
        logger.warn(
          { tokenUri: verifyResult.tokenUri, err },
          'Failed to fetch metadata from tokenURI — using available data',
        );
      }
    }

    return raw;
  }

  /**
   * Fetch and parse metadata JSON from a URI.
   * Handles IPFS, Arweave, and HTTP URIs.
   */
  private async fetchMetadataFromUri(uri: string): Promise<RawMetadata | null> {
    const urls = this.resolveImageUrls(uri);

    // Convert Arweave URIs
    if (uri.startsWith('ar://')) {
      urls.length = 0;
      urls.push(`https://arweave.net/${uri.slice(5)}`);
    }

    for (const fetchUrl of urls) {
      if (!isSafeUrl(fetchUrl)) {
        logger.warn({ fetchUrl }, 'Skipping unsafe metadata URL (SSRF protection)');
        continue;
      }
      try {
        const response = await fetch(fetchUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10_000),
          redirect: 'error', // Prevent open redirect SSRF
        });

        if (!response.ok) continue;

        // Limit metadata JSON size to 1 MB to prevent memory exhaustion
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 1_048_576) continue;
        const text = await response.text();
        if (text.length > 1_048_576) continue;
        return JSON.parse(text) as RawMetadata;
      } catch {
        // Try next gateway
      }
    }

    logger.warn({ uri }, 'Failed to fetch metadata JSON from all gateways');
    return null;
  }

  /**
   * Transform raw metadata to Metaplex standard format.
   */
  transformToMetaplex(
    raw: RawMetadata,
    nftName: string,
    collectionName: string,
    receiverWallet: string,
    provenance?: ProvenanceData,
  ): MetaplexMetadata {
    const imageSource = raw.image || raw.imageUrl || '';
    const name = raw.name || nftName;
    const description = raw.description || `Reborn NFT from ${collectionName}`;

    const attributes: Array<{ trait_type: string; value: string }> = [];
    if (raw.attributes) {
      for (const attr of raw.attributes) {
        attributes.push({
          trait_type: String(attr.trait_type),
          value: String(attr.value),
        });
      }
    }

    return {
      name,
      symbol: 'REBORN',
      description,
      image: imageSource, // Will be replaced with Arweave URI after upload
      external_url: raw.external_url,
      attributes: attributes.length > 0 ? attributes : undefined,
      properties: {
        category: 'image',
        creators: [
          { address: receiverWallet, share: 100 },
        ],
        files: [], // Will be populated after image upload
      },
      ika_tensei: provenance,
    };
  }

  /**
   * Upload image + metadata JSON to Arweave via Irys.
   * Returns the final metadata URI: https://arweave.net/{id}
   */
  async uploadToArweave(metadata: MetaplexMetadata): Promise<string> {
    const irys = await this.getIrys();

    // 1. Upload image (if we have one and it's not already on Arweave)
    let arweaveImageUri = metadata.image;

    if (metadata.image && !metadata.image.includes('arweave.net/') && !metadata.image.includes('irys.xyz/')) {
      try {
        arweaveImageUri = await this.uploadImageToArweave(irys, metadata.image);
        logger.info({ originalImage: metadata.image, arweaveImage: arweaveImageUri }, 'Image uploaded to Arweave');
      } catch (err) {
        logger.warn({ err, image: metadata.image }, 'Failed to upload image to Arweave — using original URI');
        // Keep original URI as fallback
      }
    }

    // 2. Update metadata with Arweave image URI
    metadata.image = arweaveImageUri;
    metadata.properties.files = [
      { uri: arweaveImageUri, type: 'image/png' },
    ];

    // 3. Upload metadata JSON
    const metadataJson = JSON.stringify(metadata);
    const metadataBuffer = Buffer.from(metadataJson, 'utf-8');

    const receipt = await irys.upload(metadataBuffer, {
      tags: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'App-Name', value: 'ika-tensei' },
      ],
    });

    const metadataUri = `${this.gatewayUrl}/${receipt.id}`;
    logger.info({ metadataUri, size: metadataBuffer.length }, 'Metadata JSON uploaded to Arweave');

    return metadataUri;
  }

  private static readonly IPFS_GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://dweb.link/ipfs/',
  ];

  /**
   * Download an image from any URI and re-upload to Arweave.
   * Tries multiple IPFS gateways if the source is IPFS.
   */
  private async uploadImageToArweave(irys: Irys, imageUri: string): Promise<string> {
    const urls = this.resolveImageUrls(imageUri);

    let lastError: Error | undefined;
    for (const fetchUrl of urls) {
      if (!isSafeUrl(fetchUrl)) {
        logger.warn({ fetchUrl }, 'Skipping unsafe image URL (SSRF protection)');
        continue;
      }
      try {
        const response = await fetch(fetchUrl, {
          signal: AbortSignal.timeout(15_000),
          redirect: 'error', // Prevent open redirect SSRF
        });

        if (!response.ok) {
          lastError = new Error(`${response.status} ${response.statusText} from ${fetchUrl}`);
          continue;
        }

        // Check Content-Length header before downloading
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
          lastError = new Error(`Image too large (${contentLength} bytes) from ${fetchUrl}`);
          continue;
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const imageBuffer = Buffer.from(await response.arrayBuffer());

        if (imageBuffer.length === 0) {
          lastError = new Error(`Empty response from ${fetchUrl}`);
          continue;
        }

        // Enforce size limit on actual downloaded bytes (Content-Length can lie)
        if (imageBuffer.length > MAX_IMAGE_SIZE) {
          lastError = new Error(`Image too large (${imageBuffer.length} bytes) from ${fetchUrl}`);
          continue;
        }

        const receipt = await irys.upload(imageBuffer, {
          tags: [
            { name: 'Content-Type', value: contentType },
            { name: 'App-Name', value: 'ika-tensei' },
          ],
        });

        return `${this.gatewayUrl}/${receipt.id}`;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error(`Failed to fetch image from all sources: ${imageUri}`);
  }

  /**
   * Resolve an image URI to a list of fetchable URLs.
   * IPFS URIs get expanded to multiple gateways for resilience.
   */
  private resolveImageUrls(uri: string): string[] {
    // Extract IPFS CID path from any format
    let ipfsPath: string | undefined;
    if (uri.startsWith('ipfs://')) {
      ipfsPath = uri.slice(7);
    } else if (uri.includes('/ipfs/')) {
      ipfsPath = uri.split('/ipfs/').pop();
    }

    if (ipfsPath) {
      return MetadataHandler.IPFS_GATEWAYS.map((gw) => `${gw}${ipfsPath}`);
    }

    // Non-IPFS — just return as-is
    return [uri];
  }

  /**
   * Get or create Irys client (lazy initialization).
   */
  private async getIrys(): Promise<Irys> {
    if (this.irys) return this.irys;

    const config = getConfig();

    if (!config.irysPrivateKey) {
      throw new Error('IRYS_PRIVATE_KEY not configured — cannot upload to Arweave');
    }

    this.irys = new Irys({
      network: config.irysNetwork,
      token: 'solana',
      key: config.irysPrivateKey,
      config: {
        providerUrl: config.irysNetwork === 'devnet'
          ? 'https://api.devnet.solana.com'
          : undefined,
      },
    });

    await this.irys.ready();

    const balance = await this.irys.getLoadedBalance();
    logger.info(
      { network: config.irysNetwork, balance: balance.toString() },
      'Irys client initialized',
    );

    return this.irys;
  }
}
