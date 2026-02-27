/**
 * NFT Detector — Discovers NFT token IDs at a deposit address for a given contract.
 *
 * Given a source chain, NFT contract address, and deposit address, finds which
 * tokens from that contract are held at the deposit address.
 *
 * Supported chains: EVM (Base, Ethereum, etc.), Sui, NEAR
 */

import { ethers } from 'ethers';
import { SuiClient } from '@mysten/sui/client';
import { providers } from 'near-api-js';
import { getConfig } from './config.js';
import { logger } from './logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedNFT {
  /** Contract address (EVM hex, Sui type, NEAR account) */
  contract: string;
  /** Token ID (EVM uint256 string, Sui object ID, NEAR token string) */
  tokenId: string;
  /** NFT name if available */
  name?: string;
  /** Image URL if available */
  imageUrl?: string;
}

// ERC-721 Transfer event signature
const ERC721_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// ERC-1155 TransferSingle event signature
const ERC1155_TRANSFER_SINGLE_TOPIC = ethers.id(
  'TransferSingle(address,address,address,uint256,uint256)',
);

// Minimal ABI for fetching metadata after detection
const ERC721_METADATA_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
];

// ─── NFT Detector ───────────────────────────────────────────────────────────

export class NFTDetector {
  /**
   * Detect token IDs from a specific contract at a deposit address.
   */
  async detectTokenIds(
    sourceChain: string,
    nftContract: string,
    depositAddress: string,
  ): Promise<DetectedNFT[]> {
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
        return this.detectEvm(chain, nftContract, depositAddress);
      case 'sui':
        return this.detectSui(nftContract, depositAddress);
      case 'near':
        return this.detectNear(nftContract, depositAddress);
      default:
        logger.warn({ sourceChain }, 'Unsupported chain for NFT detection');
        return [];
    }
  }

  // ─── EVM Detection ──────────────────────────────────────────────────────

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
      case 'base':
      case 'base-sepolia':
      default: return config.baseRpcUrl;
    }
  }

  private async detectEvm(
    chain: string,
    nftContract: string,
    depositAddress: string,
  ): Promise<DetectedNFT[]> {
    const rpcUrl = this.getEvmRpcUrl(chain);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const nfts: DetectedNFT[] = [];

    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 2000);
      const paddedAddr = ethers.zeroPadValue(depositAddress, 32);

      // ERC-721: Transfer(from, to, tokenId) — all indexed
      const erc721Logs = await provider.getLogs({
        address: nftContract,
        fromBlock,
        toBlock: 'latest',
        topics: [ERC721_TRANSFER_TOPIC, null, paddedAddr],
      });

      for (const log of erc721Logs) {
        if (log.topics.length >= 4) {
          const tokenId = BigInt(log.topics[3]).toString();
          nfts.push({ contract: nftContract, tokenId });
        }
      }

      // ERC-1155: TransferSingle(operator, from, to, id, value)
      // topics: [sig, operator(indexed), from(indexed), to(indexed)]
      // data: [id, value]
      const erc1155Logs = await provider.getLogs({
        address: nftContract,
        fromBlock,
        toBlock: 'latest',
        topics: [ERC1155_TRANSFER_SINGLE_TOPIC, null, null, paddedAddr],
      });

      for (const log of erc1155Logs) {
        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ['uint256', 'uint256'],
            log.data,
          );
          const tokenId = decoded[0].toString();
          // Only add if not already found via ERC-721
          if (!nfts.some((n) => n.tokenId === tokenId)) {
            nfts.push({ contract: nftContract, tokenId });
          }
        } catch {
          // Skip malformed logs
        }
      }

      // Fetch metadata for each detected NFT
      if (nfts.length > 0) {
        const contract = new ethers.Contract(nftContract, ERC721_METADATA_ABI, provider);
        let collectionName: string | undefined;
        try {
          collectionName = await contract.name();
        } catch {
          // name() not available
        }

        for (const nft of nfts) {
          if (collectionName) nft.name = `${collectionName} #${nft.tokenId}`;
        }
      }

      logger.info(
        { chain, nftContract, depositAddress, found: nfts.length },
        'EVM NFT detection complete',
      );
    } catch (err) {
      logger.error(
        { err, chain, nftContract, depositAddress },
        'EVM NFT detection failed',
      );
    }

    return nfts;
  }

  // ─── Sui Detection ──────────────────────────────────────────────────────

  private async detectSui(
    nftContract: string,
    depositAddress: string,
  ): Promise<DetectedNFT[]> {
    const config = getConfig();
    const sui = new SuiClient({ url: config.suiRpcUrl });
    const nfts: DetectedNFT[] = [];

    try {
      let cursor: string | null | undefined = undefined;

      do {
        const page = await sui.getOwnedObjects({
          owner: depositAddress,
          cursor: cursor ?? undefined,
          filter: { StructType: nftContract },
          options: { showType: true, showDisplay: true },
        });

        for (const item of page.data) {
          if (!item.data) continue;

          const display = item.data.display?.data as
            | Record<string, string>
            | undefined;

          nfts.push({
            contract: nftContract,
            tokenId: item.data.objectId,
            name: display?.name,
            imageUrl: display?.image_url,
          });
        }

        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor);

      logger.info(
        { nftContract, depositAddress, found: nfts.length },
        'Sui NFT detection complete',
      );
    } catch (err) {
      logger.error(
        { err, nftContract, depositAddress },
        'Sui NFT detection failed',
      );
    }

    return nfts;
  }

  // ─── NEAR Detection ─────────────────────────────────────────────────────

  private async detectNear(
    nftContract: string,
    depositAddress: string,
  ): Promise<DetectedNFT[]> {
    const config = getConfig();
    const provider = new providers.JsonRpcProvider({ url: config.nearRpcUrl });
    const nfts: DetectedNFT[] = [];

    // NEAR deposit addresses are bare hex (no 0x prefix)
    const nearAddr = depositAddress.startsWith('0x')
      ? depositAddress.slice(2)
      : depositAddress;

    try {
      const result = await provider.query({
        request_type: 'call_function',
        account_id: nftContract,
        method_name: 'nft_tokens_for_owner',
        args_base64: Buffer.from(
          JSON.stringify({ account_id: nearAddr, limit: 10 }),
        ).toString('base64'),
        finality: 'final',
      });

      const resultBytes = (result as unknown as { result: number[] }).result;
      const tokens = JSON.parse(Buffer.from(resultBytes).toString('utf-8'));

      for (const token of tokens) {
        nfts.push({
          contract: nftContract,
          tokenId: token.token_id,
          name: token.metadata?.title,
          imageUrl: token.metadata?.media,
        });
      }

      logger.info(
        { nftContract, nearAddr, found: nfts.length },
        'NEAR NFT detection complete',
      );
    } catch (err) {
      logger.error(
        { err, nftContract, nearAddr },
        'NEAR NFT detection failed',
      );
    }

    return nfts;
  }
}
