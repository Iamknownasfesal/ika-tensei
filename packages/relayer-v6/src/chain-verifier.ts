/**
 * Chain Verifier — Verifies NFT deposits on source chains via RPC.
 *
 * Centralized flow: the relayer queries each chain directly to confirm
 * that the deposit address owns the specified NFT.
 *
 * Supported chains: Base (EVM), Sui, NEAR, Aptos
 */

import { ethers } from 'ethers';
import { SuiClient } from '@mysten/sui/client';
import { providers } from 'near-api-js';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { getConfig } from './config.js';
import { logger } from './logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DepositParams {
  /** NFT contract address (EVM hex, Sui type, NEAR account, Aptos creator addr) */
  nftContract: string;
  /** Token ID (EVM uint256, Sui object ID, NEAR string, Aptos object addr) */
  tokenId: string;
  /** Expected deposit address that should own the NFT */
  depositAddress: string;
  /** Optional tx hash for additional verification context */
  txHash?: string;
}

export interface VerifyResult {
  verified: boolean;
  error?: string;
  /** Token URI from on-chain (may be empty) */
  tokenUri?: string;
  /** NFT name (extracted from Sui Display or on-chain metadata) */
  name?: string;
  /** Direct image URL (from Sui Display or metadata) */
  imageUrl?: string;
  /** NFT description (from Sui Display or on-chain metadata) */
  description?: string;
  /** Source collection name */
  collectionName?: string;
}

// ERC-721 ABI fragment for ownership and metadata queries
const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
];

// ─── Chain Verifier ─────────────────────────────────────────────────────────

export class ChainVerifier {
  /**
   * Verify that the deposit address owns the specified NFT on the source chain.
   */
  async verifyDeposit(sourceChain: string, params: DepositParams): Promise<VerifyResult> {
    const chain = sourceChain.toLowerCase();

    switch (chain) {
      case 'base':
      case 'base-sepolia':
      case 'ethereum':
      case 'ethereum-sepolia':
      case 'polygon':
      case 'arbitrum':
      case 'arbitrum-sepolia':
      case 'optimism':
      case 'optimism-sepolia':
      case 'bsc':
      case 'avalanche':
        return this.verifyEvm(chain, params);
      case 'sui':
        return this.verifySui(params);
      case 'near':
        return this.verifyNear(params);
      case 'aptos':
        return this.verifyAptos(params);
      default:
        return { verified: false, error: `Unsupported source chain: ${sourceChain}` };
    }
  }

  // ─── EVM (Base, Ethereum, etc.) ─────────────────────────────────────────

  /** Get the RPC URL for a specific EVM chain. */
  private getEvmRpcUrl(chain: string): string {
    const config = getConfig();
    switch (chain) {
      case 'ethereum':
      case 'ethereum-sepolia': return config.ethereumRpcUrl || config.baseRpcUrl;
      case 'polygon': return config.polygonRpcUrl || config.baseRpcUrl;
      case 'arbitrum':
      case 'arbitrum-sepolia': return config.arbitrumRpcUrl || config.baseRpcUrl;
      case 'optimism':
      case 'optimism-sepolia': return config.optimismRpcUrl || config.baseRpcUrl;
      case 'bsc': return config.baseRpcUrl; // TODO: add bscRpcUrl
      case 'avalanche': return config.baseRpcUrl; // TODO: add avalancheRpcUrl
      case 'base':
      case 'base-sepolia':
      default: return config.baseRpcUrl;
    }
  }

  private async verifyEvm(chain: string, params: DepositParams): Promise<VerifyResult> {
    const rpcUrl = this.getEvmRpcUrl(chain);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(params.nftContract, ERC721_ABI, provider);

    try {
      // Try ERC-721 ownerOf first
      let owner: string;
      try {
        owner = await contract.ownerOf(params.tokenId);
      } catch {
        // Fallback: try ERC-1155 balanceOf
        try {
          const balance: bigint = await contract.balanceOf(params.depositAddress, params.tokenId);
          if (balance > 0n) {
            owner = params.depositAddress; // Has balance, treat as owner
          } else {
            return { verified: false, error: 'NFT not found at deposit address (ERC-1155 balance = 0)' };
          }
        } catch {
          return { verified: false, error: 'Failed to verify NFT ownership (neither ERC-721 nor ERC-1155)' };
        }
      }

      if (owner.toLowerCase() !== params.depositAddress.toLowerCase()) {
        return {
          verified: false,
          error: `NFT owned by ${owner}, not deposit address ${params.depositAddress}`,
        };
      }

      // Fetch metadata
      let tokenUri: string | undefined;
      let collectionName: string | undefined;
      try {
        tokenUri = await contract.tokenURI(params.tokenId);
      } catch {
        logger.warn({ nftContract: params.nftContract, tokenId: params.tokenId }, 'tokenURI not available');
      }
      try {
        collectionName = await contract.name();
      } catch {
        logger.warn({ nftContract: params.nftContract }, 'Collection name not available');
      }

      logger.info(
        { nftContract: params.nftContract, tokenId: params.tokenId, owner },
        'EVM NFT ownership verified',
      );

      return { verified: true, tokenUri, collectionName };
    } catch (err) {
      return {
        verified: false,
        error: `EVM verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── Sui ────────────────────────────────────────────────────────────────

  private async verifySui(params: DepositParams): Promise<VerifyResult> {
    const config = getConfig();
    const sui = new SuiClient({ url: config.suiRpcUrl });

    try {
      const obj = await sui.getObject({
        id: params.tokenId, // On Sui, tokenId is the object ID
        options: { showContent: true, showDisplay: true, showOwner: true, showType: true },
      });

      if (!obj.data) {
        return { verified: false, error: `Sui object ${params.tokenId} not found` };
      }

      // Check ownership — direct AddressOwner or inside a kiosk owned by deposit address
      const owner = obj.data.owner;
      let ownerAddress: string | undefined;

      if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
        ownerAddress = owner.AddressOwner;
      } else if (owner && typeof owner === 'object' && 'ObjectOwner' in owner) {
        // NFT is inside another object — trace ownership chain to find kiosk
        // Kiosk stores items as dynamic object fields: NFT → dynamic_field::Field → Kiosk
        ownerAddress = await this.traceKioskOwner(sui, owner.ObjectOwner, params.tokenId);
      }

      if (!ownerAddress) {
        return { verified: false, error: 'NFT is not owned by an address (not direct owner or kiosk)' };
      }

      if (ownerAddress.toLowerCase() !== params.depositAddress.toLowerCase()) {
        return {
          verified: false,
          error: `NFT owned by ${ownerAddress}, not deposit address ${params.depositAddress}`,
        };
      }

      // Extract Display data for metadata
      let name: string | undefined;
      let imageUrl: string | undefined;
      let description: string | undefined;
      let collectionName: string | undefined;
      const display = obj.data.display?.data;
      if (display && typeof display === 'object') {
        const d = display as Record<string, string>;
        name = d.name;
        imageUrl = d.image_url;
        description = d.description;
        collectionName = d.collection || d.project_name;
      }

      // Fallback: read name/description/image_url from object content fields
      // (Display data may not be available on all RPC providers)
      if (!name || !imageUrl) {
        const content = obj.data.content;
        if (content && content.dataType === 'moveObject') {
          const fields = content.fields as Record<string, unknown>;
          if (!name && typeof fields.name === 'string') name = fields.name;
          if (!imageUrl && typeof fields.image_url === 'string') imageUrl = fields.image_url;
          if (!description && typeof fields.description === 'string') description = fields.description;
        }
      }

      // Derive collection name from type if not in Display
      if (!collectionName && obj.data.type) {
        // Type format: "0xpkg::module::StructName"
        const parts = obj.data.type.split('::');
        if (parts.length >= 3) {
          collectionName = parts[parts.length - 1];
        }
      }

      logger.info(
        { objectId: params.tokenId, owner: ownerAddress, name },
        'Sui NFT ownership verified',
      );

      return { verified: true, name, imageUrl, description, collectionName };
    } catch (err) {
      return {
        verified: false,
        error: `Sui verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Trace ObjectOwner chain to find a kiosk and return its AddressOwner.
   * Kiosk stores items as dynamic object fields: NFT → dynamic_field::Field → Kiosk → address.
   * Follows up to 3 levels of ObjectOwner to find the kiosk.
   */
  private async traceKioskOwner(
    sui: SuiClient,
    parentId: string,
    nftObjectId: string,
  ): Promise<string | undefined> {
    let currentId = parentId;

    // Follow ObjectOwner chain up to 3 levels (NFT → wrapper → kiosk)
    for (let depth = 0; depth < 3; depth++) {
      const obj = await sui.getObject({
        id: currentId,
        options: { showOwner: true, showType: true },
      });

      if (!obj.data) return undefined;

      const objOwner = obj.data.owner;
      const objType = obj.data.type || '';

      // Found a kiosk — return its AddressOwner
      if (objType.includes('::kiosk::Kiosk')) {
        if (objOwner && typeof objOwner === 'object' && 'AddressOwner' in objOwner) {
          logger.info(
            { objectId: nftObjectId, kioskId: currentId, kioskOwner: objOwner.AddressOwner, depth },
            'NFT found inside kiosk',
          );
          return objOwner.AddressOwner;
        }
        return undefined; // Kiosk exists but isn't address-owned (shared?)
      }

      // Follow the ObjectOwner chain deeper
      if (objOwner && typeof objOwner === 'object' && 'ObjectOwner' in objOwner) {
        currentId = objOwner.ObjectOwner;
        continue;
      }

      // Hit an AddressOwner or other owner type before finding a kiosk
      return undefined;
    }

    return undefined;
  }

  // ─── NEAR ───────────────────────────────────────────────────────────────

  private async verifyNear(params: DepositParams): Promise<VerifyResult> {
    const config = getConfig();

    try {
      const provider = new providers.JsonRpcProvider({ url: config.nearRpcUrl });

      // Call nft_token view function on the NFT contract
      const result = await provider.query({
        request_type: 'call_function',
        account_id: params.nftContract,
        method_name: 'nft_token',
        args_base64: Buffer.from(JSON.stringify({ token_id: params.tokenId })).toString('base64'),
        finality: 'final',
      });

      const resultBytes = (result as unknown as { result: number[] }).result;
      const tokenData = JSON.parse(Buffer.from(resultBytes).toString('utf-8'));

      if (!tokenData) {
        return { verified: false, error: `Token ${params.tokenId} not found on ${params.nftContract}` };
      }

      // Check ownership — NEAR implicit accounts are bare hex (no 0x prefix)
      const nearDepositAddr = params.depositAddress.startsWith('0x')
        ? params.depositAddress.slice(2)
        : params.depositAddress;
      if (tokenData.owner_id !== nearDepositAddr) {
        return {
          verified: false,
          error: `NFT owned by ${tokenData.owner_id}, not deposit address ${nearDepositAddr}`,
        };
      }

      // Extract metadata
      let tokenUri: string | undefined;
      let name: string | undefined;
      let imageUrl: string | undefined;
      if (tokenData.metadata) {
        tokenUri = tokenData.metadata.reference || tokenData.metadata.media;
        name = tokenData.metadata.title;
        imageUrl = tokenData.metadata.media;
      }

      logger.info(
        { nftContract: params.nftContract, tokenId: params.tokenId, owner: tokenData.owner_id },
        'NEAR NFT ownership verified',
      );

      return { verified: true, tokenUri, name, imageUrl, collectionName: params.nftContract };
    } catch (err) {
      return {
        verified: false,
        error: `NEAR verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── Aptos ──────────────────────────────────────────────────────────────

  private async verifyAptos(params: DepositParams): Promise<VerifyResult> {
    const config = getConfig();

    try {
      const aptosConfig = new AptosConfig({
        network: config.aptosRpcUrl.includes('testnet') ? Network.TESTNET : Network.MAINNET,
        fullnode: config.aptosRpcUrl,
      });
      const aptos = new Aptos(aptosConfig);

      // On Aptos Token v2, each token is an object with its own address
      // params.tokenId is the token object address
      const tokenResource = await aptos.getAccountResource({
        accountAddress: params.tokenId,
        resourceType: '0x4::token::Token',
      });

      if (!tokenResource) {
        return { verified: false, error: `Aptos token ${params.tokenId} not found` };
      }

      // Check ownership by reading the object's owner
      const objectResource = await aptos.getAccountResource({
        accountAddress: params.tokenId,
        resourceType: '0x1::object::ObjectCore',
      });

      const owner = (objectResource as { owner: string }).owner;
      if (owner.toLowerCase() !== params.depositAddress.toLowerCase()) {
        return {
          verified: false,
          error: `NFT owned by ${owner}, not deposit address ${params.depositAddress}`,
        };
      }

      // Extract URI from token data
      const tokenUri = (tokenResource as { uri: string }).uri;
      const name = (tokenResource as { name: string }).name;
      const collectionName = (tokenResource as { collection: { inner: string } }).collection?.inner;

      logger.info(
        { tokenId: params.tokenId, owner, name },
        'Aptos NFT ownership verified',
      );

      return { verified: true, tokenUri, name, collectionName };
    } catch (err) {
      return {
        verified: false,
        error: `Aptos verification failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
