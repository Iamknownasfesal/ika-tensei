import { API_BASE } from "./constants";

// ─── v8 API Types (session-based, multi-step) ────────────────────────────────

export interface StartSealRequest {
  solanaWallet: string;
  sourceChain: string;
}

export interface StartSealResponse {
  sessionId: string;
  paymentAddress: string;
  feeAmountLamports: number;
}

export interface ConfirmPaymentRequest {
  sessionId: string;
  paymentTxSignature: string;
}

export interface ConfirmPaymentResponse {
  dwalletId: string;
  depositAddress: string;
}

export interface ConfirmDepositRequest {
  sessionId: string;
  nftContract: string;
  tokenId: string;
  txHash?: string;
}

export interface ConfirmDepositResponse {
  status: string;
  message: string;
}

export interface DetectedNFT {
  contract: string;
  tokenId: string;
  name?: string;
  imageUrl?: string;
}

export interface DetectNFTsResponse {
  nfts: DetectedNFT[];
}

/** Status values matching the relayer's SealStatusValue type */
export type SealStatusValue =
  | "awaiting_payment"
  | "payment_confirmed"
  | "creating_dwallet"
  | "waiting_deposit"
  | "verifying_deposit"
  | "uploading_metadata"
  | "creating_seal"
  | "signing"
  | "minting"
  | "complete"
  | "error";

export interface SealStatusResponse {
  sessionId: string;
  dwalletId?: string;
  status: SealStatusValue;
  depositAddress?: string;
  sourceChain?: string;
  nftContract?: string;
  tokenId?: string;
  tokenUri?: string;
  rebornNFT?: {
    mint: string;
    name: string;
    image: string;
  };
  error?: string;
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────────

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || error.message || `API error: ${res.status}`);
  }
  return res.json();
}

// ─── v8 API: Session-Based Seal Flow ─────────────────────────────────────────

/**
 * Step 1: Create a seal session — returns payment details.
 * User must send SOL to paymentAddress before proceeding.
 */
export async function startSeal(
  solanaWallet: string,
  sourceChain: string
): Promise<StartSealResponse> {
  return fetchApi<StartSealResponse>("/api/seal/start", {
    method: "POST",
    body: JSON.stringify({ solanaWallet, sourceChain } satisfies StartSealRequest),
  });
}

/**
 * Step 2: Confirm SOL payment — triggers dWallet creation.
 * Returns the deposit address for the user's NFT.
 */
export async function confirmPayment(
  sessionId: string,
  paymentTxSignature: string
): Promise<ConfirmPaymentResponse> {
  return fetchApi<ConfirmPaymentResponse>("/api/seal/confirm-payment", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      paymentTxSignature,
    } satisfies ConfirmPaymentRequest),
  });
}

/**
 * Step 3: Confirm NFT deposit — triggers relayer verification + processing.
 * Returns immediately; processing continues async on the server.
 */
export async function confirmDeposit(
  sessionId: string,
  nftContract: string,
  tokenId: string,
  txHash?: string
): Promise<ConfirmDepositResponse> {
  return fetchApi<ConfirmDepositResponse>("/api/seal/confirm-deposit", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      nftContract,
      tokenId,
      txHash,
    } satisfies ConfirmDepositRequest),
  });
}

/**
 * Detect NFTs at the deposit address for a given contract.
 * Returns token IDs found at the address.
 */
export async function detectNFTs(
  sessionId: string,
  nftContract: string
): Promise<DetectNFTsResponse> {
  return fetchApi<DetectNFTsResponse>("/api/seal/detect-nfts", {
    method: "POST",
    body: JSON.stringify({ sessionId, nftContract }),
  });
}

/**
 * Poll the status of a seal session.
 */
export async function getSealStatus(
  sessionId: string
): Promise<SealStatusResponse> {
  return fetchApi<SealStatusResponse>(`/api/seal/${sessionId}/status`);
}

// ─── Other endpoints ──────────────────────────────────────────────────────────

export async function getRebornNfts(solanaAddress: string) {
  return fetchApi<{
    nfts: Array<{
      mint: string;
      name: string;
      image: string;
      originalChain: string;
      originalContract: string;
      originalTokenId: string;
      sealHash: string;
      rebornDate: string;
    }>;
  }>(`/api/reborn?address=${encodeURIComponent(solanaAddress)}`);
}

// ─── Guild / DAO Types ───────────────────────────────────────────────────────

export interface GuildRealm {
  realm_address: string;
  collection_name: string;
  realm_name: string;
  community_mint: string;
  governance_address: string;
  treasury_address: string;
  collection_asset: string | null;
  created_at: number;
}

export interface GuildProposal {
  address: string;
  name: string;
  description: string;
  state: number;
  stateName: string;
  yesVotes: string;
  noVotes: string;
  votingAt: number | null;
  votingCompletedAt: number | null;
  governance: string;
}

export interface GuildTreasury {
  realmAddress: string;
  treasuryAddress: string;
  balanceLamports: number;
  balanceSol: number;
}

export interface GuildStats {
  totalSealed: number;
  realmCount: number;
  collectionCount: number;
  totalTreasurySol: number;
}

// ─── Guild / DAO Fetchers ────────────────────────────────────────────────────

export async function getGuildRealms(): Promise<{ realms: GuildRealm[] }> {
  return fetchApi<{ realms: GuildRealm[] }>("/api/guild/realms");
}

export async function getGuildProposals(
  realmAddress: string
): Promise<{ proposals: GuildProposal[]; realmAddress: string; realmName: string }> {
  return fetchApi<{ proposals: GuildProposal[]; realmAddress: string; realmName: string }>(
    `/api/guild/realm/${encodeURIComponent(realmAddress)}/proposals`
  );
}

export async function getGuildTreasury(
  realmAddress: string
): Promise<GuildTreasury> {
  return fetchApi<GuildTreasury>(
    `/api/guild/realm/${encodeURIComponent(realmAddress)}/treasury`
  );
}

export async function getGuildStats(): Promise<GuildStats> {
  return fetchApi<GuildStats>("/api/guild/stats");
}

export async function getStats() {
  return fetchApi<{ sealed: number; reborn: number; chains: number }>(
    "/api/stats"
  );
}
