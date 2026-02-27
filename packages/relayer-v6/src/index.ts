/**
 * Ika Tensei v8 Relayer - Main Entry Point
 *
 * Five roles:
 * 1. VAA ingester — polls Wormholescan for signed VAAs, submits process_vaa() to Sui
 * 2. API server — accepts seal requests, creates deposit dWallets via IKA SDK
 * 3. SealPending listener — watches SealPending events, triggers IKA signing
 * 4. SealSigned listener — watches SealSigned events, bridges to Solana
 * 5. Background maintenance — treasury balances, presign pool replenishment
 *
 * v8 changes from v7:
 * - VAA ingester: automatic Wormholescan polling for EVM/NEAR VAAs
 * - Treasury-funded coordinator calls (DKG, presign, sign)
 * - Presign pool with FIFO allocation
 * - Full signing flow: SealPending → IKA 2PC-MPC → complete_seal → SealSigned
 * - Configurable SuiListener supports multiple event types
 */

import { readFileSync } from "fs";
import { randomUUID, createHash } from "crypto";
import type { Server } from "http";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { IkaClient } from "@ika.xyz/sdk";
import { getNetworkConfig } from "@ika.xyz/sdk";
import express from "express";
import cors from "cors";
import { getConfig } from "./config.js";
import { SuiListener } from "./sui-listener.js";
import { SolanaSubmitter } from "./solana-submitter.js";
import { DWalletCreator } from "./dwallet-creator.js";
import { rateLimitSuiClient } from "./rate-limited-sui-client.js";
import { TreasuryManager } from "./treasury-manager.js";
import { PresignPool } from "./presign-pool.js";
import { SealSigner } from "./seal-signer.js";
import { VAAIngester } from "./vaa-ingester.js";
import { HealthServer } from "./health.js";
import { logger } from "./logger.js";
import {
  initDb,
  getDb,
  createSession,
  getSession,
  getSessionByDeposit,
  getCompletedSessionsByWallet,
  updateSession,
  updateSessionByDeposit,
  isPaymentTxUsed,
  expireOldSessions,
  atomicStatusTransition,
  insertRealm,
  getAllRealms,
  getRealmByAddress,
  updateRealmCollectionAsset,
} from "./db.js";
import { ChainVerifier } from "./chain-verifier.js";
import { NFTDetector } from "./nft-detector.js";
import { MetadataHandler } from "./metadata-handler.js";
import { SuiTxQueue } from "./sui-tx-queue.js";
import { RealmCreator, deriveGovernancePda } from "./realm-creator.js";
import type {
  SealSignedEvent,
  SealPendingEvent,
  ProcessedSeal,
  SealSession,
  StartSealRequest,
  ConfirmPaymentRequest,
  ConfirmDepositRequest,
} from "./types.js";

/**
 * Relayer orchestrates the full seal flow:
 * - VAA ingestion from Wormholescan → Sui process_vaa
 * - API for dWallet creation
 * - SealPending → IKA signing → complete_seal
 * - SealSigned → Solana minting
 * - Treasury + presign pool maintenance
 */
export class Relayer {
  private readonly sealSignedListener: SuiListener<SealSignedEvent>;
  private readonly sealPendingListener: SuiListener<SealPendingEvent>;
  private readonly solanaSubmitter: SolanaSubmitter;
  private readonly dwalletCreator: DWalletCreator;
  private readonly chainVerifier: ChainVerifier;
  private readonly nftDetector: NFTDetector;
  private readonly metadataHandler: MetadataHandler;
  private readonly realmCreator: RealmCreator;
  private readonly healthServer: HealthServer;
  private readonly relayerKeypair: Keypair;
  private readonly app: express.Application;
  private httpServer?: Server;
  private _isRunning = false;
  private readonly intervals: ReturnType<typeof setInterval>[] = [];

  // New v8 services (initialized lazily in start())
  private treasuryManager?: TreasuryManager;
  private presignPool?: PresignPool;
  private sealSigner?: SealSigner;
  private vaaIngester?: VAAIngester;

  // Sui client + keypair for centralized seal creation
  private suiClient?: SuiClient;
  private suiKeypair?: Ed25519Keypair;

  // Transaction queue — serializes all Sui txns to avoid shared object version conflicts
  readonly suiTxQueue = new SuiTxQueue();

  constructor() {
    const config = getConfig();
    initDb(config.dbPath);

    this.sealSignedListener = new SuiListener<SealSignedEvent>("SealSigned");
    this.sealPendingListener = new SuiListener<SealPendingEvent>("SealPending");
    this.solanaSubmitter = new SolanaSubmitter();
    this.dwalletCreator = new DWalletCreator();
    this.chainVerifier = new ChainVerifier();
    this.nftDetector = new NFTDetector();
    this.metadataHandler = new MetadataHandler();
    this.realmCreator = new RealmCreator();
    this.healthServer = new HealthServer();
    this.relayerKeypair = this.loadRelayerKeypair();
    this.app = express();
    this.setupApi();
  }

  // ─── API Server ─────────────────────────────────────────────────────────────

  private setupApi(): void {
    const config = getConfig();

    // CORS: restrict to configured origins (default: allow all for dev)
    const allowedOrigins = config.corsAllowedOrigins;
    if (allowedOrigins) {
      this.app.use(
        cors({ origin: allowedOrigins.split(",").map((o) => o.trim()) }),
      );
    } else {
      this.app.use(cors());
    }
    this.app.use(express.json({ limit: "10kb" }));

    // API key middleware for admin/internal endpoints
    const apiKey = config.apiKey;
    if (!apiKey) {
      logger.warn(
        "RELAYER_API_KEY is not set — admin endpoints will reject all requests",
      );
    }
    const requireApiKey: express.RequestHandler = (req, res, next) => {
      if (!apiKey) {
        res
          .status(401)
          .json({ error: "Unauthorized — API key not configured" });
        return;
      }
      const provided = req.headers["x-api-key"] || req.query.apiKey;
      if (provided !== apiKey) {
        res
          .status(401)
          .json({ error: "Unauthorized — invalid or missing API key" });
        return;
      }
      next();
    };

    // Simple in-memory rate limiter for seal endpoints
    const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
    const rateLimit: express.RequestHandler = (req, res, next) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const windowMs = 60_000; // 1 minute
      const maxRequests = 20; // max 20 requests per minute per IP

      let entry = rateLimitMap.get(ip);
      if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        rateLimitMap.set(ip, entry);
      }
      entry.count++;
      if (entry.count > maxRequests) {
        res.status(429).json({ error: "Too many requests — try again later" });
        return;
      }
      next();
    };

    // Periodic cleanup of expired rate limit entries to prevent memory leak
    setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
      }
    }, 300_000); // every 5 minutes

    // Allowed source chains for input validation
    const ALLOWED_CHAINS = new Set([
      "base",
      "ethereum",
      "polygon",
      "arbitrum",
      "optimism",
      "bsc",
      "avalanche",
      "sui",
      "near",
      "aptos",
      "base-sepolia",
      "ethereum-sepolia",
      "arbitrum-sepolia",
      "optimism-sepolia",
    ]);

    // Per-wallet rate limiting: max 5 active sessions per wallet
    const MAX_ACTIVE_SESSIONS_PER_WALLET = 5;

    /**
     * POST /api/seal/start
     */
    this.app.post("/api/seal/start", rateLimit, (req, res) => {
      try {
        const { solanaWallet, sourceChain } = req.body as StartSealRequest;

        if (!solanaWallet || !sourceChain) {
          res
            .status(400)
            .json({ error: "Missing solanaWallet or sourceChain" });
          return;
        }

        // Validate sourceChain is in allowed list
        if (!ALLOWED_CHAINS.has(sourceChain.toLowerCase())) {
          res
            .status(400)
            .json({ error: `Unsupported source chain: ${sourceChain}` });
          return;
        }

        // Validate solanaWallet is a valid base58 pubkey
        try {
          new PublicKey(solanaWallet);
        } catch {
          res.status(400).json({ error: "Invalid Solana wallet address" });
          return;
        }

        // Per-wallet rate limit: prevent resource exhaustion via mass session creation
        const activeCount = (
          getDb()
            .prepare(
              `SELECT COUNT(*) as c FROM sessions WHERE solana_wallet = ? AND status NOT IN ('complete', 'error')`,
            )
            .get(solanaWallet) as { c: number }
        ).c;
        if (activeCount >= MAX_ACTIVE_SESSIONS_PER_WALLET) {
          res
            .status(429)
            .json({ error: "Too many active sessions for this wallet" });
          return;
        }

        const config = getConfig();
        const sessionId = randomUUID();

        const session: SealSession = {
          sessionId,
          solanaWallet,
          sourceChain,
          status: "awaiting_payment",
          createdAt: Date.now(),
        };
        createSession(session);

        logger.info(
          { sessionId, solanaWallet, sourceChain },
          "Seal session created — awaiting payment",
        );

        res.json({
          sessionId,
          paymentAddress: this.relayerKeypair.publicKey.toBase58(),
          feeAmountLamports: config.sealFeeLamports,
        });
      } catch (err) {
        logger.error({ err }, "Failed to start seal session");
        res.status(500).json({
          error: "Failed to start seal session",
        });
      }
    });

    /**
     * POST /api/seal/confirm-payment
     */
    this.app.post("/api/seal/confirm-payment", rateLimit, async (req, res) => {
      try {
        const { sessionId, paymentTxSignature } =
          req.body as ConfirmPaymentRequest;

        if (!sessionId || !paymentTxSignature) {
          res
            .status(400)
            .json({ error: "Missing sessionId or paymentTxSignature" });
          return;
        }

        const session = getSession(sessionId);
        if (!session) {
          res.status(404).json({ error: "Session not found" });
          return;
        }

        if (session.status !== "awaiting_payment") {
          res
            .status(409)
            .json({
              error: "Payment already confirmed or session in progress",
            });
          return;
        }

        // Replay protection: reject payment tx signatures already used for another session
        if (isPaymentTxUsed(paymentTxSignature)) {
          res
            .status(409)
            .json({
              error: "Payment transaction already used for another session",
            });
          return;
        }

        const config = getConfig();

        // Validate payment sender matches session wallet
        const verification = await this.solanaSubmitter.verifyPayment(
          paymentTxSignature,
          session.solanaWallet,
          this.relayerKeypair.publicKey.toBase58(),
          config.sealFeeLamports,
        );

        if (!verification.verified) {
          res
            .status(402)
            .json({
              error: verification.error || "Payment verification failed",
            });
          return;
        }

        // Atomic transition: awaiting_payment → payment_confirmed
        // If another concurrent request already transitioned, this returns false
        const claimed = atomicStatusTransition(
          sessionId,
          "awaiting_payment",
          "payment_confirmed",
          {
            payment_tx_sig: paymentTxSignature,
            payment_verified: Date.now(),
          },
        );
        if (!claimed) {
          res
            .status(409)
            .json({ error: "Payment already confirmed (concurrent request)" });
          return;
        }

        logger.info(
          {
            sessionId,
            paymentTxSignature,
            lamports: verification.actualLamports,
          },
          "Payment verified — creating dWallet",
        );

        updateSession(sessionId, { status: "creating_dwallet" });
        const dwallet = await this.dwalletCreator.create(session.sourceChain);

        updateSession(sessionId, {
          status: "waiting_deposit",
          dwallet_id: dwallet.id,
          deposit_address: dwallet.depositAddress,
          dwallet_pubkey: Buffer.from(dwallet.pubkey),
        });

        logger.info(
          {
            sessionId,
            dwalletId: dwallet.id,
            depositAddress: dwallet.depositAddress,
          },
          "dWallet created successfully",
        );

        res.json({
          dwalletId: dwallet.id,
          depositAddress: dwallet.depositAddress,
        });
      } catch (err) {
        logger.error({ err }, "Failed to confirm payment");
        const msg = err instanceof Error ? err.message : "";
        // Only expose validation errors, not internal details
        const safeMsg =
          msg.includes("not found") ||
          msg.includes("Invalid") ||
          msg.includes("already")
            ? msg
            : "Failed to confirm payment";
        res.status(500).json({ error: safeMsg });
      }
    });

    /**
     * POST /api/seal/detect-nfts
     * Detect NFT token IDs at the deposit address for a given contract.
     * User provides contract address; relayer discovers which tokens are there.
     */
    this.app.post("/api/seal/detect-nfts", rateLimit, async (req, res) => {
      try {
        const { sessionId, nftContract } = req.body;

        if (!sessionId || !nftContract) {
          res.status(400).json({ error: "Missing sessionId or nftContract" });
          return;
        }

        if (nftContract.length > 256) {
          res
            .status(400)
            .json({ error: "nftContract too long (max 256 chars)" });
          return;
        }

        const session = getSession(sessionId);
        if (!session) {
          res.status(404).json({ error: "Session not found" });
          return;
        }

        if (session.status !== "waiting_deposit") {
          res
            .status(409)
            .json({ error: "Session not in waiting_deposit state" });
          return;
        }

        if (!session.depositAddress) {
          res.status(409).json({ error: "No deposit address available" });
          return;
        }

        const nfts = await this.nftDetector.detectTokenIds(
          session.sourceChain,
          nftContract,
          session.depositAddress,
        );

        res.json({ nfts });
      } catch (err) {
        logger.error({ err }, "NFT detection failed");
        res.status(500).json({ error: "NFT detection failed" });
      }
    });

    /**
     * POST /api/seal/confirm-deposit
     * Centralized flow: user confirms NFT deposit, relayer verifies + processes.
     */
    this.app.post("/api/seal/confirm-deposit", rateLimit, async (req, res) => {
      try {
        const { sessionId, nftContract, tokenId, txHash } =
          req.body as ConfirmDepositRequest;

        if (!sessionId || !nftContract || !tokenId) {
          res
            .status(400)
            .json({ error: "Missing sessionId, nftContract, or tokenId" });
          return;
        }

        // Sanitize: reject obviously malformed inputs (max 256 chars each)
        if (nftContract.length > 256 || tokenId.length > 256) {
          res
            .status(400)
            .json({ error: "nftContract or tokenId too long (max 256 chars)" });
          return;
        }

        const session = getSession(sessionId);
        if (!session) {
          res.status(404).json({ error: "Session not found" });
          return;
        }

        if (session.status !== "waiting_deposit") {
          res
            .status(409)
            .json({ error: `Session not ready for deposit confirmation` });
          return;
        }

        if (!session.depositAddress) {
          res
            .status(409)
            .json({ error: "No deposit address — confirm payment first" });
          return;
        }

        // Atomic transition: waiting_deposit → verifying_deposit
        // Prevents two concurrent confirm-deposit calls from both proceeding
        const claimed = atomicStatusTransition(
          sessionId,
          "waiting_deposit",
          "verifying_deposit",
          {
            nft_contract: nftContract,
            token_id: tokenId,
            deposit_tx_hash: txHash,
          },
        );
        if (!claimed) {
          res
            .status(409)
            .json({
              error: "Deposit already being processed (concurrent request)",
            });
          return;
        }

        // Respond immediately — processing continues async
        res.json({
          status: "processing",
          message: "Verifying deposit and processing metadata",
        });

        // Process asynchronously
        this.processDeposit(sessionId, session).catch((err) => {
          logger.error({ err, sessionId }, "Deposit processing failed");
          updateSession(sessionId, {
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } catch (err) {
        logger.error({ err }, "Failed to confirm deposit");
        const msg = err instanceof Error ? err.message : "";
        const safeMsg =
          msg.includes("not found") ||
          msg.includes("Invalid") ||
          msg.includes("already")
            ? msg
            : "Failed to confirm deposit";
        res.status(500).json({ error: safeMsg });
      }
    });

    /**
     * GET /api/seal/:id/status
     */
    this.app.get("/api/seal/:id/status", (req, res) => {
      const session = getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: "Seal session not found" });
        return;
      }

      // Only expose user-facing fields, not internal IDs or pubkeys
      res.json({
        sessionId: session.sessionId,
        status: session.status,
        depositAddress: session.depositAddress,
        sourceChain: session.sourceChain,
        nftContract: session.nftContract,
        tokenId: session.tokenId,
        rebornNFT: session.rebornNFT,
        error: session.error,
      });
    });

    /**
     * GET /api/reborn?address=<solanaWallet>
     * Returns all completed reborn NFTs for a given Solana wallet.
     */
    this.app.get("/api/reborn", (req, res) => {
      const address = req.query.address as string;
      if (!address) {
        res.status(400).json({ error: "Missing address query parameter" });
        return;
      }

      const sessions = getCompletedSessionsByWallet(address);
      const nfts = sessions
        .filter((s) => s.rebornNFT)
        .map((s) => ({
          mint: s.rebornNFT!.mint,
          name: s.rebornNFT!.name || s.nftName || "Reborn NFT",
          image: s.rebornNFT!.image || "",
          originalChain: s.sourceChain,
          originalContract: s.nftContract || "",
          originalTokenId: s.tokenId || "",
          sealHash: s.sessionId,
          rebornDate: new Date(s.createdAt).toISOString(),
        }));

      res.json({ nfts });
    });

    /**
     * GET /api/treasury/balances
     */
    this.app.get("/api/treasury/balances", requireApiKey, async (_req, res) => {
      try {
        if (!this.treasuryManager) {
          res.status(503).json({ error: "Treasury manager not initialized" });
          return;
        }
        const balances = await this.treasuryManager.getBalances();
        res.json({
          ika: balances.ika.toString(),
          sui: balances.sui.toString(),
        });
      } catch (err) {
        res.status(500).json({ error: "Internal error" });
      }
    });

    /**
     * GET /api/presign/stats
     */
    this.app.get("/api/presign/stats", requireApiKey, (_req, res) => {
      if (!this.presignPool) {
        res.status(503).json({ error: "Presign pool not initialized" });
        return;
      }
      res.json(this.presignPool.stats());
    });

    // ─── Guild / DAO Endpoints ────────────────────────────────────────────────

    /**
     * GET /api/guild/realms — All DAO realms
     */
    this.app.get("/api/guild/realms", async (_req, res) => {
      try {
        const realms = getAllRealms();
        res.json({ realms });
      } catch (err) {
        logger.error({ err }, "Failed to fetch realms");
        res.status(500).json({ error: "Failed to fetch realms" });
      }
    });

    /**
     * GET /api/guild/realm/:address/proposals — Proposals for a realm
     */
    this.app.get("/api/guild/realm/:address/proposals", async (req, res) => {
      try {
        const realmAddress = req.params.address;
        const realm = getRealmByAddress(realmAddress);
        if (!realm) {
          res.status(404).json({ error: "Realm not found" });
          return;
        }

        const config = getConfig();
        const connection = new Connection(config.solanaRpcUrl, "confirmed");

        // Fetch proposals via SPL Governance SDK
        const { PublicKey } = await import("@solana/web3.js");
        const {
          getGovernanceAccounts,
          pubkeyFilter,
          Governance,
          getProposalsByGovernance,
          ProposalState,
        } = await import("@solana/spl-governance");

        const SPL_GOV_PROGRAM = new PublicKey(
          "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
        );
        const realmPk = new PublicKey(realmAddress);

        // Find all governance accounts for this realm
        const governances = await getGovernanceAccounts(
          connection,
          SPL_GOV_PROGRAM,
          Governance,
          [pubkeyFilter(1, realmPk)!],
        );

        const proposals: Array<{
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
        }> = [];

        for (const gov of governances) {
          const govProposals = await getProposalsByGovernance(
            connection,
            SPL_GOV_PROGRAM,
            gov.pubkey,
          );

          for (const prop of govProposals) {
            const data = prop.account;
            proposals.push({
              address: prop.pubkey.toBase58(),
              name: data.name,
              description: data.descriptionLink || "",
              state: data.state,
              stateName: ProposalState[data.state] || "Unknown",
              yesVotes: data.getYesVoteCount().toString(),
              noVotes: data.getNoVoteCount().toString(),
              votingAt: data.votingAt ? data.votingAt.toNumber() : null,
              votingCompletedAt: data.votingCompletedAt
                ? data.votingCompletedAt.toNumber()
                : null,
              governance: gov.pubkey.toBase58(),
            });
          }
        }

        res.json({ proposals, realmAddress, realmName: realm.realm_name });
      } catch (err) {
        logger.error(
          { err, realmAddress: req.params.address },
          "Failed to fetch proposals",
        );
        res.status(500).json({ error: "Failed to fetch proposals" });
      }
    });

    /**
     * GET /api/guild/realm/:address/treasury — Treasury balance
     */
    this.app.get("/api/guild/realm/:address/treasury", async (req, res) => {
      try {
        const realmAddress = req.params.address;
        const realm = getRealmByAddress(realmAddress);
        if (!realm) {
          res.status(404).json({ error: "Realm not found" });
          return;
        }

        const config = getConfig();
        const connection = new Connection(config.solanaRpcUrl, "confirmed");
        const { PublicKey } = await import("@solana/web3.js");

        const treasuryPk = new PublicKey(realm.treasury_address);
        const balance = await connection.getBalance(treasuryPk);

        res.json({
          realmAddress,
          treasuryAddress: realm.treasury_address,
          balanceLamports: balance,
          balanceSol: balance / 1e9,
        });
      } catch (err) {
        logger.error(
          { err, realmAddress: req.params.address },
          "Failed to fetch treasury",
        );
        res.status(500).json({ error: "Failed to fetch treasury balance" });
      }
    });

    /**
     * GET /api/guild/stats — Aggregate guild stats
     */
    this.app.get("/api/guild/stats", async (_req, res) => {
      try {
        const d = getDb();
        const totalSealed = (
          d
            .prepare(
              `SELECT COUNT(*) as c FROM sessions WHERE status = 'complete'`,
            )
            .get() as { c: number }
        ).c;
        const realms = getAllRealms();
        const realmCount = realms.length;
        const collectionCount = new Set(realms.map((r) => r.collection_name))
          .size;

        // Sum treasury balances
        let totalTreasurySol = 0;
        try {
          const config = getConfig();
          const connection = new Connection(config.solanaRpcUrl, "confirmed");
          const { PublicKey } = await import("@solana/web3.js");
          for (const realm of realms) {
            const bal = await connection.getBalance(
              new PublicKey(realm.treasury_address),
            );
            totalTreasurySol += bal / 1e9;
          }
        } catch {
          // Best-effort treasury sum
        }

        res.json({
          totalSealed,
          realmCount,
          collectionCount,
          totalTreasurySol,
        });
      } catch (err) {
        logger.error({ err }, "Failed to fetch guild stats");
        res.status(500).json({ error: "Failed to fetch guild stats" });
      }
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    logger.info("Starting Ika Tensei v8 Relayer…");

    // Verify Sui connection
    const suiOk = await this.sealSignedListener.checkConnection();
    this.healthServer.setSuiConnected(suiOk);
    if (!suiOk) {
      throw new Error("Sui RPC connection failed");
    }

    // Verify Solana connection
    const solanaOk = await this.solanaSubmitter.checkConnection();
    this.healthServer.setSolanaConnected(solanaOk);
    if (!solanaOk) {
      throw new Error("Solana RPC connection failed");
    }

    logger.info("All connections verified");

    // Initialize v8 services (treasury, presign pool, seal signer)
    await this.initializeSigningServices();

    // Start health endpoint
    this.healthServer.start();

    // Start API server
    const config = getConfig();
    this.httpServer = this.app.listen(config.apiPort, () => {
      logger.info({ port: config.apiPort }, "API server listening");
    });

    // Subscribe to event listeners BEFORE starting VAA ingester
    // (otherwise process_vaa fires SealPending before the listener is ready)
    await this.sealPendingListener.start(async (event, eventId) => {
      await this.handleSealPending(event, eventId);
    });

    await this.sealSignedListener.start(async (event, eventId) => {
      await this.processSealEvent(event, eventId);
    });

    // Initialize and start VAA ingester AFTER event listeners are subscribed
    // Gated behind ENABLE_VAA_INGESTER — disabled by default for centralized flow
    if (config.enableVaaIngester) {
      await this.initializeVAAIngester();
    } else {
      logger.info(
        "VAA ingester disabled (centralized flow) — set ENABLE_VAA_INGESTER=true to enable",
      );
    }

    this._isRunning = true;
    logger.info("Relayer is running");

    // Periodic maintenance (store refs for graceful shutdown)
    this.intervals.push(
      setInterval(() => {
        this.checkConnections().catch((err) => {
          logger.error({ err }, "Connection check failed");
        });
      }, 30_000),
    );

    this.intervals.push(
      setInterval(() => {
        this.treasuryManager?.ensureMinimumBalances().catch((err) => {
          logger.error({ err }, "Treasury maintenance failed");
        });
      }, 60_000),
    );

    this.intervals.push(
      setInterval(() => {
        const config = getConfig();
        this.presignPool
          ?.ensureMinimumAvailable(config.presignPoolMinAvailable)
          .catch((err) => {
            logger.error({ err }, "Presign pool maintenance failed");
          });
      }, 30_000),
    );

    // Expire stale sessions (1 hour old, check every 5 minutes)
    this.intervals.push(
      setInterval(() => {
        const expired = expireOldSessions(3600);
        if (expired > 0) logger.info({ expired }, "Expired stale sessions");
      }, 5 * 60_000),
    );
  }

  /**
   * Initialize the signing services (treasury, presign pool, seal signer).
   * These require Sui + IKA clients and are only available when the
   * necessary config values (object IDs) are set.
   */
  private async initializeSigningServices(): Promise<void> {
    const config = getConfig();

    if (!config.suiOrchestratorStateId || !config.suiSigningStateId) {
      logger.warn(
        "Signing services disabled — missing orchestrator/signing state IDs",
      );
      return;
    }

    const sui = rateLimitSuiClient(new SuiClient({ url: config.suiRpcUrl }));
    const suiKeypair = this.loadSuiKeypair(config.suiKeypairPath);
    this.suiClient = sui;
    this.suiKeypair = suiKeypair;
    const ikaConfig = getNetworkConfig(config.ikaNetwork);
    const ikaClient = new IkaClient({ suiClient: sui, config: ikaConfig });
    await ikaClient.initialize();

    // Treasury manager
    this.treasuryManager = new TreasuryManager(
      sui,
      suiKeypair,
      ikaConfig,
      this.suiTxQueue,
    );
    await this.treasuryManager.ensureMinimumBalances();

    // Presign pool
    this.presignPool = new PresignPool(
      sui,
      suiKeypair,
      ikaClient,
      ikaConfig,
      this.suiTxQueue,
    );
    const initialPresigns = config.presignPoolReplenishBatch;
    logger.info(
      { count: initialPresigns },
      "Seeding initial presign pool (background)",
    );
    this.presignPool.replenish(initialPresigns).catch((err) => {
      logger.warn(
        { err },
        "Initial presign seeding failed — will retry in maintenance cycle",
      );
    });

    // Seal signer needs minting dWallet DKG outputs
    // These must be stored (e.g., in a file or env vars) after the initial minting dWallet creation
    const mintingKeyShareHex = process.env.MINTING_DWALLET_SECRET_KEY_SHARE;
    const mintingPublicOutputHex = process.env.MINTING_DWALLET_PUBLIC_OUTPUT;

    if (mintingKeyShareHex && mintingPublicOutputHex) {
      const userSecretKeyShare = hexToBytes(mintingKeyShareHex);
      const userPublicOutput = hexToBytes(mintingPublicOutputHex);

      this.sealSigner = new SealSigner(
        sui,
        ikaClient,
        ikaConfig,
        suiKeypair,
        this.presignPool,
        userSecretKeyShare,
        userPublicOutput,
        this.suiTxQueue,
      );
      logger.info("Seal signer initialized");
    } else {
      logger.warn(
        "MINTING_DWALLET_SECRET_KEY_SHARE / MINTING_DWALLET_PUBLIC_OUTPUT not set — signing disabled",
      );
    }
  }

  /**
   * Initialize the VAA ingester (polls Wormholescan for source chain VAAs).
   * Requires wormholeStateObjectId and at least one source chain emitter.
   */
  private async initializeVAAIngester(): Promise<void> {
    const config = getConfig();

    if (!config.wormholeStateObjectId) {
      logger.warn("VAA ingester disabled — WORMHOLE_STATE_OBJECT_ID not set");
      return;
    }

    if (config.sourceChainEmitters.length === 0) {
      logger.warn(
        "VAA ingester disabled — no SOURCE_CHAIN_EMITTERS configured",
      );
      return;
    }

    const sui = new SuiClient({ url: config.suiRpcUrl });
    const suiKeypair = this.loadSuiKeypair(config.suiKeypairPath);

    this.vaaIngester = new VAAIngester(sui, suiKeypair, this.suiTxQueue);
    await this.vaaIngester.start();
    logger.info("VAA ingester started");
  }

  async stop(): Promise<void> {
    logger.info("Stopping relayer…");
    // Clear all background intervals first
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.length = 0;
    this.vaaIngester?.stop();
    await this.sealSignedListener.unsubscribeFromEvents();
    await this.sealPendingListener.unsubscribeFromEvents();
    this.healthServer.stop();
    // Gracefully close HTTP server (stop accepting new connections, drain existing)
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }
    this._isRunning = false;
    logger.info("Relayer stopped");
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  // ─── Event Processing ───────────────────────────────────────────────────────

  /**
   * Handle SealPending event — trigger the signing flow.
   */
  private async handleSealPending(
    event: SealPendingEvent,
    eventId: string,
  ): Promise<void> {
    const vaaHashDisplay = Array.isArray(event.vaa_hash)
      ? Buffer.from(event.vaa_hash).toString("hex")
      : event.vaa_hash;
    logger.info(
      { eventId, vaaHash: vaaHashDisplay },
      "Processing SealPending event",
    );

    if (!this.sealSigner) {
      logger.error({ eventId }, "Seal signer not initialized — cannot sign");
      return;
    }

    try {
      await this.sealSigner.signAndComplete(event);
      logger.info(
        { eventId, vaaHash: vaaHashDisplay },
        "Signing flow completed",
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // MoveAbort errors are non-retriable (e.g., seal already completed, invalid state).
      // Don't rethrow — let the cursor advance past this event.
      if (errMsg.includes("MoveAbort") || errMsg.includes("already")) {
        logger.warn(
          { err, eventId, vaaHash: vaaHashDisplay },
          "Signing flow failed with non-retriable error — skipping event",
        );
        return;
      }

      // For transient errors (network, timeout), rethrow so the cursor
      // stays put and we retry on the next poll cycle.
      logger.error(
        { err, eventId, vaaHash: vaaHashDisplay },
        "Signing flow failed — will retry",
      );
      throw err;
    }
  }

  /**
   * Handle SealSigned event — bridge to Solana.
   */
  private async processSealEvent(
    event: SealSignedEvent,
    eventId: string,
  ): Promise<void> {
    logger.info(
      { eventId, tokenId: event.token_id },
      "Processing SealSigned event",
    );

    try {
      const processedSeal = this.parseSealEvent(event);

      const depositAddressHex = Buffer.from(
        toBytes(event.deposit_address),
      ).toString("hex");
      this.updateSessionStatus(depositAddressHex, "minting");

      // Look up session to get real names from source chain metadata
      const session = getSessionByDeposit(depositAddressHex);
      if (session?.collectionName) {
        processedSeal.collectionName = session.collectionName;
      }

      // Compute DAO treasury PDA for royalties (deterministic from collection name)
      const treasuryPubkey = this.realmCreator.computeTreasuryAddress(
        processedSeal.collectionName,
      );
      processedSeal.daoTreasury = treasuryPubkey.toBytes();

      logger.info(
        {
          eventId,
          receiver: Buffer.from(processedSeal.receiver).toString("hex"),
          collectionName: processedSeal.collectionName,
          daoTreasury: treasuryPubkey.toBase58(),
        },
        "Submitting mint_reborn to Solana",
      );

      const result = await this.solanaSubmitter.submitMintReborn(
        processedSeal,
        this.relayerKeypair,
      );

      if (result.success) {
        logger.info(
          {
            eventId,
            txHash: result.txHash,
            retries: result.retries,
            assetAddress: result.assetAddress,
          },
          "Successfully processed SealSigned event",
        );
        this.healthServer.incrementProcessed();
        this.healthServer.setLastProcessedEvent(eventId);

        // Store reborn NFT data in session
        if (session && result.assetAddress) {
          const rebornName = session.nftName || processedSeal.collectionName;
          // reborn_image may already be set (Arweave image URL from metadata upload)
          // Only fall back to tokenUri if it wasn't set earlier
          const existingRow = getDb()
            .prepare("SELECT reborn_image FROM sessions WHERE session_id = ?")
            .get(session.sessionId) as { reborn_image: string | null } | undefined;
          const rebornImage = existingRow?.reborn_image || session.tokenUri || processedSeal.tokenUri;
          updateSession(session.sessionId, {
            status: "complete",
            reborn_mint: result.assetAddress,
            reborn_name: rebornName,
            reborn_image: rebornImage,
          });
        } else {
          this.updateSessionStatus(depositAddressHex, "complete");
        }

        // Create SPL Governance Realm + voter plugin for new collections (fire-and-forget)
        if (result.isNewCollection) {
          const collName = processedSeal.collectionName;
          const collAddress = result.collectionAssetAddress;
          const conn = new Connection(getConfig().solanaRpcUrl, "confirmed");

          this.realmCreator
            .createRealmForCollection(collName, this.relayerKeypair, conn)
            .then(async ({ realmAddress, treasuryAddress, communityMint }) => {
              logger.info(
                { realmAddress, treasuryAddress, collectionName: collName },
                "Realm DAO created for collection",
              );

              // Derive governance address for DB storage
              const { PublicKey } = await import("@solana/web3.js");
              const realmPk = new PublicKey(realmAddress);
              const governancePk = deriveGovernancePda(realmPk, realmPk);

              // Persist realm data to DB
              insertRealm({
                realm_address: realmAddress,
                collection_name: collName,
                realm_name: `Reborn: ${collName}`,
                community_mint: communityMint,
                governance_address: governancePk.toBase58(),
                treasury_address: treasuryAddress,
                created_at: Date.now(),
              });
              logger.info(
                { realmAddress, collectionName: collName },
                "Realm persisted to database",
              );

              // Phase 2: configure voter plugin with the Core collection
              if (collAddress) {
                await this.realmCreator.configureRealmForCollection(
                  collName,
                  collAddress,
                  communityMint,
                  this.relayerKeypair,
                  conn,
                );
                // Persist collection asset address
                updateRealmCollectionAsset(realmAddress, collAddress);
                logger.info(
                  { collectionName: collName, collectionAsset: collAddress },
                  "Voter plugin configured for collection",
                );
              }
            })
            .catch((err) => {
              logger.error(
                { err, collectionName: collName },
                "Failed to create/configure realm DAO — can be done manually later",
              );
            });
        }
      } else {
        logger.error(
          { eventId, error: result.error, retries: result.retries },
          "Failed to process SealSigned event",
        );
        this.healthServer.incrementFailed();
        this.updateSessionStatusError(
          depositAddressHex,
          result.error ?? "Unknown error",
        );
      }
    } catch (err) {
      logger.error({ err, eventId }, "Exception processing SealSigned event");
      this.healthServer.incrementFailed();
    }
  }

  private parseSealEvent(event: SealSignedEvent): ProcessedSeal {
    const signature = toBytes(event.signature);
    const dwalletPubkey = toBytes(event.dwallet_pubkey);
    const messageHash = toBytes(event.message_hash);
    const receiver = toBytes(event.receiver);
    const nftContract = toBytes(event.nft_contract);
    const tokenId = toBytes(event.token_id);
    const tokenUri = Buffer.from(toBytes(event.token_uri)).toString("utf-8");
    const nftContractHex = Buffer.from(nftContract).toString("hex");
    const collectionName = this.deriveCollectionName(
      event.source_chain,
      nftContractHex,
    );

    return {
      signature,
      dwalletPubkey,
      sourceChain: event.source_chain,
      nftContract,
      tokenId,
      tokenUri,
      receiver,
      collectionName,
      messageHash,
      daoTreasury: new Uint8Array(32), // Placeholder — overridden by realm-creator before mint
    };
  }

  // ─── Session Management ─────────────────────────────────────────────────────

  private updateSessionStatus(
    depositAddress: string,
    status: SealSession["status"],
  ): void {
    updateSessionByDeposit(depositAddress, status);
  }

  private updateSessionStatusError(
    depositAddress: string,
    error: string,
  ): void {
    updateSessionByDeposit(depositAddress, "error", error);
  }

  // ─── Centralized Deposit Processing ─────────────────────────────────────────

  /**
   * Process a confirmed deposit: verify → fetch metadata → upload → create seal.
   * Called asynchronously after /api/seal/confirm-deposit responds.
   */
  private async processDeposit(
    sessionId: string,
    _session: SealSession,
  ): Promise<void> {
    // Reload session to get the nftContract/tokenId we just stored
    const updatedSession = getSession(sessionId);
    if (
      !updatedSession?.nftContract ||
      !updatedSession?.tokenId ||
      !updatedSession?.depositAddress
    ) {
      throw new Error("Session missing required deposit fields");
    }

    // Idempotency: if session already advanced past verifying_deposit, skip
    if (updatedSession.status !== "verifying_deposit") {
      logger.warn(
        { sessionId, status: updatedSession.status },
        "processDeposit called but session already advanced — skipping",
      );
      return;
    }

    // 1. Verify NFT deposit on source chain
    logger.info(
      { sessionId, sourceChain: updatedSession.sourceChain },
      "Verifying NFT deposit on source chain",
    );
    const verifyResult = await this.chainVerifier.verifyDeposit(
      updatedSession.sourceChain,
      {
        nftContract: updatedSession.nftContract,
        tokenId: updatedSession.tokenId,
        depositAddress: updatedSession.depositAddress,
      },
    );

    if (!verifyResult.verified) {
      throw new Error(`Deposit verification failed: ${verifyResult.error}`);
    }

    logger.info(
      { sessionId, tokenUri: verifyResult.tokenUri, name: verifyResult.name },
      "NFT deposit verified",
    );

    // 2. Fetch + transform + upload metadata to Arweave
    // For Sui, tokenId is a full 0x... object ID — shorten for display
    const shortTokenId = updatedSession.tokenId?.startsWith("0x") && updatedSession.tokenId.length > 16
      ? updatedSession.tokenId.slice(0, 8) + "…" + updatedSession.tokenId.slice(-6)
      : updatedSession.tokenId;
    const nftName =
      verifyResult.name ||
      `${verifyResult.collectionName || "NFT"} #${shortTokenId}`;
    const collectionName =
      verifyResult.collectionName || `Reborn ${updatedSession.sourceChain}`;

    updateSession(sessionId, {
      status: "uploading_metadata",
      nft_name: nftName,
      collection_name: collectionName,
    });

    const { metadataUri: tokenUri, imageUrl: rebornImageUrl } = await this.metadataHandler.processAndUpload(
      updatedSession.sourceChain,
      verifyResult,
      nftName,
      collectionName,
      updatedSession.solanaWallet,
      {
        sourceContract: updatedSession.nftContract!,
        sourceTokenId: updatedSession.tokenId!,
        depositAddress: updatedSession.depositAddress!,
        sourceChainId: this.sourceChainToId(updatedSession.sourceChain),
      },
    );

    updateSession(sessionId, { token_uri: tokenUri, reborn_image: rebornImageUrl });
    logger.info({ sessionId, tokenUri, rebornImageUrl }, "Metadata uploaded to Arweave");

    // 3. Re-verify NFT ownership (TOCTOU protection — NFT could have been moved since initial check)
    const reVerify = await this.chainVerifier.verifyDeposit(
      updatedSession.sourceChain,
      {
        nftContract: updatedSession.nftContract!,
        tokenId: updatedSession.tokenId!,
        depositAddress: updatedSession.depositAddress!,
      },
    );
    if (!reVerify.verified) {
      throw new Error(`Re-verification failed (TOCTOU): ${reVerify.error}`);
    }

    // 4. Create centralized seal on Sui (emits SealPending → existing signing flow)
    updateSession(sessionId, { status: "creating_seal" });
    await this.createCentralizedSeal(updatedSession, tokenUri);

    updateSession(sessionId, { status: "signing" });
    logger.info(
      { sessionId },
      "Centralized seal created — signing flow initiated",
    );
  }

  /**
   * Call create_centralized_seal() on Sui orchestrator.
   * This creates a PendingSeal and emits SealPending, which the
   * existing SealSigner picks up and processes identically to VAA-based seals.
   */
  private async createCentralizedSeal(
    session: SealSession,
    tokenUri: string,
  ): Promise<void> {
    if (!this.suiClient || !this.suiKeypair) {
      throw new Error("Sui client not initialized");
    }

    const config = getConfig();

    // Map source chain name to Wormhole chain ID
    const chainId = this.sourceChainToId(session.sourceChain);

    // Encode nft_contract as bytes (hex for EVM, UTF-8 hash for others)
    const nftContractBytes = this.encodeNftContract(
      session.sourceChain,
      session.nftContract!,
    );

    // Encode token_id as bytes
    const tokenIdBytes = this.encodeTokenId(
      session.sourceChain,
      session.tokenId!,
    );

    // Encode deposit_address as bytes
    const depositAddressBytes = this.encodeDepositAddress(
      session.sourceChain,
      session.depositAddress!,
    );

    // Receiver is the Solana wallet (32-byte pubkey)
    const { PublicKey } = await import("@solana/web3.js");
    const receiverBytes = new PublicKey(session.solanaWallet).toBytes();

    // Token URI as UTF-8 bytes
    const tokenUriBytes = new TextEncoder().encode(tokenUri);

    const { Transaction } = await import("@mysten/sui/transactions");
    const tx = new Transaction();

    tx.moveCall({
      target: `${config.suiPackageId}::orchestrator::create_centralized_seal`,
      arguments: [
        tx.object(config.suiOrchestratorStateId),
        tx.object(config.suiAdminCapId),
        tx.object(config.suiMintingAuthorityId),
        tx.pure.u16(chainId),
        tx.pure.vector("u8", Array.from(nftContractBytes)),
        tx.pure.vector("u8", Array.from(tokenIdBytes)),
        tx.pure.vector("u8", Array.from(tokenUriBytes)),
        tx.pure.vector("u8", Array.from(depositAddressBytes)),
        tx.pure.vector("u8", Array.from(receiverBytes)),
        tx.object("0x6"), // Clock
      ],
    });

    const result = await this.suiTxQueue.enqueue(
      "create_centralized_seal",
      () =>
        this.suiClient!.signAndExecuteTransaction({
          transaction: tx,
          signer: this.suiKeypair!,
          options: { showEvents: true },
        }),
    );

    logger.info(
      { txDigest: result.digest, sessionId: session.sessionId },
      "create_centralized_seal submitted",
    );
  }

  /**
   * Map source chain name to Wormhole chain ID.
   */
  private sourceChainToId(sourceChain: string): number {
    const map: Record<string, number> = {
      ethereum: 2,
      polygon: 5,
      arbitrum: 23,
      optimism: 24,
      base: 30,
      bsc: 4,
      avalanche: 6,
      sui: 21,
      near: 15,
      aptos: 22,
      solana: 1,
      // Testnets
      "base-sepolia": 10004,
      "ethereum-sepolia": 10002,
      "arbitrum-sepolia": 10003,
      "optimism-sepolia": 10005,
    };
    const id = map[sourceChain.toLowerCase()];
    if (!id) throw new Error(`Unknown source chain: ${sourceChain}`);
    return id;
  }

  /**
   * Encode NFT contract address to 32-byte format for Sui.
   */
  private encodeNftContract(
    sourceChain: string,
    nftContract: string,
  ): Uint8Array {
    const chain = sourceChain.toLowerCase();

    if (
      [
        "base",
        "ethereum",
        "polygon",
        "arbitrum",
        "optimism",
        "bsc",
        "avalanche",
        "base-sepolia",
        "ethereum-sepolia",
        "arbitrum-sepolia",
        "optimism-sepolia",
      ].includes(chain)
    ) {
      // EVM: 20-byte address → left-pad to 32 bytes
      const clean = nftContract.startsWith("0x")
        ? nftContract.slice(2)
        : nftContract;
      const bytes = new Uint8Array(32);
      const addrBytes = hexToBytes(clean);
      bytes.set(addrBytes, 32 - addrBytes.length);
      return bytes;
    }

    if (chain === "sui") {
      // Sui: sha256(type_name) → 32 bytes (matches contract logic)
      return new Uint8Array(createHash("sha256").update(nftContract).digest());
    }

    if (chain === "near") {
      // NEAR: sha256(account_id) → 32 bytes
      return new Uint8Array(createHash("sha256").update(nftContract).digest());
    }

    if (chain === "aptos") {
      // Aptos: 32-byte address
      const clean = nftContract.startsWith("0x")
        ? nftContract.slice(2)
        : nftContract;
      const bytes = new Uint8Array(32);
      const addrBytes = hexToBytes(clean);
      bytes.set(addrBytes, 32 - addrBytes.length);
      return bytes;
    }

    throw new Error(`Cannot encode nft_contract for chain: ${sourceChain}`);
  }

  /**
   * Encode token ID to bytes for Sui.
   */
  private encodeTokenId(sourceChain: string, tokenId: string): Uint8Array {
    const chain = sourceChain.toLowerCase();

    if (
      [
        "base",
        "ethereum",
        "polygon",
        "arbitrum",
        "optimism",
        "bsc",
        "avalanche",
        "base-sepolia",
        "ethereum-sepolia",
        "arbitrum-sepolia",
        "optimism-sepolia",
      ].includes(chain)
    ) {
      // EVM: uint256 → 32 bytes big-endian
      let val: bigint;
      try {
        val = BigInt(tokenId);
      } catch {
        throw new Error(
          `Invalid token ID (not a number): ${tokenId.slice(0, 32)}`,
        );
      }
      if (val < 0n || val >= 2n ** 256n)
        throw new Error("Token ID out of uint256 range");
      const hex = val.toString(16).padStart(64, "0");
      return hexToBytes(hex);
    }

    if (chain === "sui" || chain === "aptos") {
      // Sui/Aptos: object address → 32 bytes
      const clean = tokenId.startsWith("0x") ? tokenId.slice(2) : tokenId;
      const bytes = new Uint8Array(32);
      const addrBytes = hexToBytes(clean);
      bytes.set(addrBytes, 32 - addrBytes.length);
      return bytes;
    }

    if (chain === "near") {
      // NEAR: sha256(token_id_string)
      return new Uint8Array(createHash("sha256").update(tokenId).digest());
    }

    throw new Error(`Cannot encode token_id for chain: ${sourceChain}`);
  }

  /**
   * Encode deposit address to bytes.
   */
  private encodeDepositAddress(
    sourceChain: string,
    depositAddress: string,
  ): Uint8Array {
    const chain = sourceChain.toLowerCase();

    if (
      [
        "base",
        "ethereum",
        "polygon",
        "arbitrum",
        "optimism",
        "bsc",
        "avalanche",
        "base-sepolia",
        "ethereum-sepolia",
        "arbitrum-sepolia",
        "optimism-sepolia",
      ].includes(chain)
    ) {
      // EVM: 20-byte address (not padded for deposit_address — matches how dwallet_creator stores it)
      const clean = depositAddress.startsWith("0x")
        ? depositAddress.slice(2)
        : depositAddress;
      return hexToBytes(clean);
    }

    // Ed25519 chains: 32-byte hex or base58 address
    if (chain === "sui" || chain === "aptos") {
      const clean = depositAddress.startsWith("0x")
        ? depositAddress.slice(2)
        : depositAddress;
      return hexToBytes(clean);
    }

    if (chain === "near") {
      // NEAR implicit account: hex-encoded ed25519 pubkey
      return hexToBytes(depositAddress);
    }

    throw new Error(`Cannot encode deposit_address for chain: ${sourceChain}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private loadRelayerKeypair(): Keypair {
    const config = getConfig();
    try {
      const data = readFileSync(config.relayerKeypairPath, "utf-8");
      const secretKey = new Uint8Array(JSON.parse(data));
      return Keypair.fromSecretKey(secretKey);
    } catch (err) {
      logger.error(
        { path: config.relayerKeypairPath, err },
        "Failed to load relayer keypair",
      );
      throw new Error("Could not load relayer keypair");
    }
  }

  private loadSuiKeypair(path: string): Ed25519Keypair {
    try {
      const raw = readFileSync(path, "utf-8").trim();
      if (raw.startsWith("[")) {
        const bytes = new Uint8Array(JSON.parse(raw));
        const seed = bytes.length === 64 ? bytes.slice(0, 32) : bytes;
        return Ed25519Keypair.fromSecretKey(seed);
      }
      return Ed25519Keypair.fromSecretKey(raw);
    } catch (err) {
      logger.error({ path, err }, "Failed to load Sui keypair");
      throw new Error(`Could not load Sui keypair from ${path}`);
    }
  }

  private deriveCollectionName(
    sourceChain: number,
    nftContractHex: string,
  ): string {
    const shortId = nftContractHex.slice(-8);
    return `Reborn Collection ${sourceChain}:${shortId}`;
  }

  private async checkConnections(): Promise<void> {
    const suiOk = await this.sealSignedListener.checkConnection();
    const solanaOk = await this.solanaSubmitter.checkConnection();

    this.healthServer.setSuiConnected(suiOk);
    this.healthServer.setSolanaConnected(solanaOk);

    if (!suiOk && this._isRunning) {
      logger.warn("Sui connection lost, attempting reconnect");
      await this.sealSignedListener.reconnect();
      await this.sealPendingListener.reconnect();
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Sui event vector<u8> fields to Uint8Array.
 * Sui SDK may return these as number[], base64 string, or hex string.
 */
function toBytes(value: number[] | string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      const clean = value.slice(2);
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    // Try base64 first (Sui SDK sometimes returns base64 for vector<u8>)
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fall back to hex
      const bytes = new Uint8Array(value.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
  }
  throw new Error(`Cannot convert to bytes: ${typeof value}`);
}

/**
 * Convert hex string to Uint8Array (for env var parsing).
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const relayer = new Relayer();

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down…");
    await relayer.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down…");
    await relayer.stop();
    process.exit(0);
  });

  try {
    await relayer.start();
  } catch (err) {
    logger.error({ err }, "Failed to start relayer");
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, "Unhandled error in main");
  process.exit(1);
});
