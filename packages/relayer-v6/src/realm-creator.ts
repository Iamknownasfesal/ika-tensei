/**
 * Realm Creator — Creates SPL Governance Realms with NFT voting for bridged collections.
 *
 * Two-phase flow:
 *   Phase 1 (createRealmForCollection): Before/after first mint
 *     - Pre-computes DAO treasury PDA (deterministic from collection name)
 *     - Creates council mint (relayer governance power) + community mint (placeholder)
 *     - Creates Realm with voter weight plugin configured on community token
 *     - Creates Governance + NativeTreasury (DAO wallet for royalties)
 *
 *   Phase 2 (configureRealmForCollection): After first mint creates the Core collection
 *     - Creates a Registrar in the ika-core-voter program
 *     - Configures the Metaplex Core collection in the registrar
 *     - Creates MaxVoterWeightRecord
 *
 * NFT holders can then create VoterWeightRecords and vote in the Realm.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  getMintLen,
} from '@solana/spl-token';
import {
  withCreateRealm,
  withCreateGovernance,
  withCreateNativeTreasury,
  withDepositGoverningTokens,
  GovernanceConfig,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  MintMaxVoteWeightSource,
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
} from '@solana/spl-governance';
import BN from 'bn.js';
import { logger } from './logger.js';
import { getConfig } from './config.js';

// SPL Governance program ID (mainnet & devnet)
export const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
);

// SPL Governance program version (v3 is current)
const GOVERNANCE_PROGRAM_VERSION = 3;

// ─── PDA Derivation ──────────────────────────────────────────────────────────

export function deriveRealmPda(realmName: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('governance'), Buffer.from(realmName)],
    SPL_GOVERNANCE_PROGRAM_ID,
  )[0];
}

export function deriveGovernancePda(realm: PublicKey, governedAccount: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('account-governance'), realm.toBuffer(), governedAccount.toBuffer()],
    SPL_GOVERNANCE_PROGRAM_ID,
  )[0];
}

export function deriveNativeTreasuryPda(governance: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('native-treasury'), governance.toBuffer()],
    SPL_GOVERNANCE_PROGRAM_ID,
  )[0];
}

/** Derive the registrar PDA for the core voter plugin. */
function deriveRegistrarPda(realm: PublicKey, communityMint: PublicKey, coreVoterProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('registrar'), realm.toBuffer(), communityMint.toBuffer()],
    coreVoterProgramId,
  )[0];
}

/** Derive the max voter weight record PDA. */
function deriveMaxVoterWeightRecordPda(
  realm: PublicKey, communityMint: PublicKey, coreVoterProgramId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('max-voter-weight-record'), realm.toBuffer(), communityMint.toBuffer()],
    coreVoterProgramId,
  )[0];
}

// ─── RealmCreator ────────────────────────────────────────────────────────────

export class RealmCreator {
  /**
   * Pre-compute the DAO treasury PDA address for a collection.
   * Called BEFORE the mint tx so we can include the treasury in royalties.
   * The PDA is valid even before the realm accounts exist on-chain.
   */
  computeTreasuryAddress(collectionName: string): PublicKey {
    const realmName = `Reborn: ${collectionName}`;
    const realm = deriveRealmPda(realmName);
    const governance = deriveGovernancePda(realm, realm);
    return deriveNativeTreasuryPda(governance);
  }

  /**
   * Phase 1: Create the Realm + Governance + NativeTreasury for a bridged collection.
   *
   * Uses a council mint (for relayer governance power) and a community mint
   * (placeholder — actual voting via the ika-core-voter plugin).
   *
   * Returns realm address, treasury address, and community mint (needed for Phase 2).
   */
  async createRealmForCollection(
    collectionName: string,
    relayerKeypair: Keypair,
    connection: Connection,
  ): Promise<{ realmAddress: string; treasuryAddress: string; communityMint: string }> {
    const realmName = `Reborn: ${collectionName}`;
    const payer = relayerKeypair.publicKey;
    const config = getConfig();
    const coreVoterProgramId = config.coreVoterProgramId
      ? new PublicKey(config.coreVoterProgramId)
      : null;

    logger.info({ collectionName, realmName }, 'Creating SPL Governance Realm for collection');

    // ── Create council mint (relayer governance power) ───────────────────
    const councilMintKeypair = Keypair.generate();
    const councilMint = councilMintKeypair.publicKey;

    // ── Create community mint (placeholder, voting via plugin) ───────────
    const communityMintKeypair = Keypair.generate();
    const communityMint = communityMintKeypair.publicKey;

    const mintSpace = getMintLen([]);
    const mintRent = await connection.getMinimumBalanceForRentExemption(mintSpace);

    const tx1Instructions: TransactionInstruction[] = [];

    // Create + init council mint
    tx1Instructions.push(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: councilMint,
        space: mintSpace,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(councilMint, 0, payer, null),
    );

    // Create + init community mint (no tokens minted — plugin provides weight)
    tx1Instructions.push(
      SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: communityMint,
        space: mintSpace,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(communityMint, 0, payer, null),
    );

    // Create ATA for relayer and mint 1 council token (needed for governance creation)
    const relayerCouncilAta = getAssociatedTokenAddressSync(councilMint, payer);
    tx1Instructions.push(
      createAssociatedTokenAccountInstruction(payer, relayerCouncilAta, payer, councilMint),
      createMintToInstruction(councilMint, relayerCouncilAta, payer, 1),
    );

    // ── Create Realm with voter weight plugin on community token ─────────
    const communityTokenConfig = coreVoterProgramId
      ? new GoverningTokenConfigAccountArgs({
          voterWeightAddin: coreVoterProgramId,
          maxVoterWeightAddin: coreVoterProgramId,
          tokenType: GoverningTokenType.Membership,
        })
      : undefined;

    const realmAddress = await withCreateRealm(
      tx1Instructions,
      SPL_GOVERNANCE_PROGRAM_ID,
      GOVERNANCE_PROGRAM_VERSION,
      realmName,
      payer,           // realm authority
      communityMint,
      payer,
      councilMint,     // council mint for relayer governance
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new BN(1),       // min tokens to create governance
      communityTokenConfig,
    );

    // ── Deposit council token (creates TokenOwnerRecord for relayer) ─────
    const tokenOwnerRecord = await withDepositGoverningTokens(
      tx1Instructions,
      SPL_GOVERNANCE_PROGRAM_ID,
      GOVERNANCE_PROGRAM_VERSION,
      realmAddress,
      relayerCouncilAta,  // governing token source
      councilMint,         // governing token mint = council (relayer has council power)
      payer,               // governing token owner
      payer,               // source authority
      payer,
      new BN(1),           // deposit 1 council token
    );

    // Send tx1 (mints + realm + deposit)
    const tx1 = new Transaction().add(...tx1Instructions);
    tx1.feePayer = payer;
    tx1.recentBlockhash = (
      await connection.getLatestBlockhash('confirmed')
    ).blockhash;
    tx1.partialSign(relayerKeypair, councilMintKeypair, communityMintKeypair);

    const tx1Hash = await connection.sendRawTransaction(tx1.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash1 = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature: tx1Hash, blockhash: latestBlockhash1.blockhash, lastValidBlockHeight: latestBlockhash1.lastValidBlockHeight },
      'confirmed',
    );

    logger.info(
      { txHash: tx1Hash, realmAddress: realmAddress.toBase58(), communityMint: communityMint.toBase58() },
      'Realm created with council + community mints',
    );

    // ── Create Governance + NativeTreasury (tx2) ─────────────────────────
    const tx2Instructions: TransactionInstruction[] = [];

    const governanceConfig = new GovernanceConfig({
      communityVoteThreshold: new VoteThreshold({
        type: VoteThresholdType.YesVotePercentage,
        value: 60,
      }),
      minCommunityTokensToCreateProposal: new BN(1),
      minInstructionHoldUpTime: 0,
      baseVotingTime: 3 * 24 * 60 * 60, // 3 days
      communityVoteTipping: VoteTipping.Early,
      minCouncilTokensToCreateProposal: new BN(1),
      councilVoteThreshold: new VoteThreshold({
        type: VoteThresholdType.YesVotePercentage,
        value: 60,
      }),
      councilVetoVoteThreshold: new VoteThreshold({
        type: VoteThresholdType.Disabled,
      }),
      communityVetoVoteThreshold: new VoteThreshold({
        type: VoteThresholdType.Disabled,
      }),
      councilVoteTipping: VoteTipping.Strict,
      votingCoolOffTime: 0,
      depositExemptProposalCount: 10,
    });

    // Use realm PDA as governed account (matches computeTreasuryAddress derivation)
    const governanceAddress = await withCreateGovernance(
      tx2Instructions,
      SPL_GOVERNANCE_PROGRAM_ID,
      GOVERNANCE_PROGRAM_VERSION,
      realmAddress,
      realmAddress,       // governed account = realm (deterministic)
      governanceConfig,
      tokenOwnerRecord,
      payer,
      payer,              // create authority = realm authority = payer
    );

    const treasuryAddress = await withCreateNativeTreasury(
      tx2Instructions,
      SPL_GOVERNANCE_PROGRAM_ID,
      GOVERNANCE_PROGRAM_VERSION,
      governanceAddress,
      payer,
    );

    const tx2 = new Transaction().add(...tx2Instructions);
    tx2.feePayer = payer;
    tx2.recentBlockhash = (
      await connection.getLatestBlockhash('confirmed')
    ).blockhash;
    tx2.partialSign(relayerKeypair);

    const tx2Hash = await connection.sendRawTransaction(tx2.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash2 = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature: tx2Hash, blockhash: latestBlockhash2.blockhash, lastValidBlockHeight: latestBlockhash2.lastValidBlockHeight },
      'confirmed',
    );

    // Verify treasury PDA
    const expectedTreasury = this.computeTreasuryAddress(collectionName);
    if (!treasuryAddress.equals(expectedTreasury)) {
      logger.warn(
        { actual: treasuryAddress.toBase58(), expected: expectedTreasury.toBase58() },
        'Treasury PDA mismatch — royalties may not flow to DAO',
      );
    }

    logger.info(
      {
        txHash: tx2Hash,
        realmAddress: realmAddress.toBase58(),
        governanceAddress: governanceAddress.toBase58(),
        treasuryAddress: treasuryAddress.toBase58(),
      },
      'Governance and NativeTreasury created',
    );

    return {
      realmAddress: realmAddress.toBase58(),
      treasuryAddress: treasuryAddress.toBase58(),
      communityMint: communityMint.toBase58(),
    };
  }

  /**
   * Phase 2: Configure the voter weight plugin for a collection.
   *
   * Called after the first mint creates the Metaplex Core collection on Solana.
   * Creates a Registrar, configures the collection, and creates a MaxVoterWeightRecord.
   */
  async configureRealmForCollection(
    collectionName: string,
    collectionAssetAddress: string,
    communityMintAddress: string,
    relayerKeypair: Keypair,
    connection: Connection,
  ): Promise<void> {
    const config = getConfig();
    if (!config.coreVoterProgramId) {
      logger.warn('CORE_VOTER_PROGRAM_ID not set — skipping voter plugin configuration');
      return;
    }

    const coreVoterProgramId = new PublicKey(config.coreVoterProgramId);
    const realmName = `Reborn: ${collectionName}`;
    const realm = deriveRealmPda(realmName);
    const communityMint = new PublicKey(communityMintAddress);
    const collectionAsset = new PublicKey(collectionAssetAddress);
    const payer = relayerKeypair.publicKey;

    logger.info(
      { collectionName, collectionAssetAddress, communityMintAddress },
      'Configuring voter plugin for collection',
    );

    // Derive PDAs
    const registrar = deriveRegistrarPda(realm, communityMint, coreVoterProgramId);
    const maxVoterWeightRecord = deriveMaxVoterWeightRecordPda(realm, communityMint, coreVoterProgramId);

    const instructions: TransactionInstruction[] = [];

    // ── Instruction 1: create_registrar ──────────────────────────────────
    // Anchor discriminator: SHA256("global:create_registrar")[..8]
    const createRegistrarDisc = Buffer.from([132, 235, 36, 49, 139, 66, 202, 69]);
    instructions.push(
      new TransactionInstruction({
        programId: coreVoterProgramId,
        keys: [
          { pubkey: registrar, isSigner: false, isWritable: true },
          { pubkey: SPL_GOVERNANCE_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: realm, isSigner: false, isWritable: false },
          { pubkey: communityMint, isSigner: false, isWritable: false },
          { pubkey: payer, isSigner: true, isWritable: false },  // realm_authority
          { pubkey: payer, isSigner: true, isWritable: true },   // payer
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: createRegistrarDisc,
      }),
    );

    // ── Instruction 2: configure_collection ──────────────────────────────
    const configureCollectionDisc = Buffer.from([71, 128, 33, 233, 71, 167, 155, 164]);
    const configureData = Buffer.alloc(8 + 32 + 8);
    configureCollectionDisc.copy(configureData);
    collectionAsset.toBuffer().copy(configureData, 8);
    // weight = 1 (little-endian u64)
    configureData.writeUInt32LE(1, 40);
    configureData.writeUInt32LE(0, 44);

    instructions.push(
      new TransactionInstruction({
        programId: coreVoterProgramId,
        keys: [
          { pubkey: registrar, isSigner: false, isWritable: true },
          { pubkey: realm, isSigner: false, isWritable: false },     // realm (for ownership check)
          { pubkey: payer, isSigner: true, isWritable: false },      // realm_authority
        ],
        data: configureData,
      }),
    );

    // ── Instruction 3: create_max_voter_weight_record ────────────────────
    const createMaxVwrDisc = Buffer.from([182, 70, 243, 119, 162, 176, 38, 248]);
    const maxWeight = Buffer.alloc(8 + 8);
    createMaxVwrDisc.copy(maxWeight);
    // max_voter_weight = 10000 (large value since Core collections have no fixed supply)
    maxWeight.writeUInt32LE(10000, 8);
    maxWeight.writeUInt32LE(0, 12);

    instructions.push(
      new TransactionInstruction({
        programId: coreVoterProgramId,
        keys: [
          { pubkey: registrar, isSigner: false, isWritable: false },          // registrar (for realm ownership check)
          { pubkey: maxVoterWeightRecord, isSigner: false, isWritable: true },
          { pubkey: realm, isSigner: false, isWritable: false },
          { pubkey: communityMint, isSigner: false, isWritable: false },
          { pubkey: payer, isSigner: true, isWritable: false },  // realm_authority
          { pubkey: payer, isSigner: true, isWritable: true },   // payer
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: maxWeight,
      }),
    );

    const tx = new Transaction().add(...instructions);
    tx.feePayer = payer;
    tx.recentBlockhash = (
      await connection.getLatestBlockhash('confirmed')
    ).blockhash;
    tx.partialSign(relayerKeypair);

    const txHash = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature: txHash, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
      'confirmed',
    );

    logger.info(
      {
        txHash,
        registrar: registrar.toBase58(),
        maxVoterWeightRecord: maxVoterWeightRecord.toBase58(),
        collection: collectionAssetAddress,
      },
      'Voter plugin configured for collection',
    );
  }
}
