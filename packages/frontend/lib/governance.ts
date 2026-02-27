/**
 * Client-side vote transaction builder for SPL Governance.
 *
 * Builds a Solana transaction with:
 *   1. CreateTokenOwnerRecord (if first interaction)
 *   2. UpdateVoterWeightRecord (ika-core-voter — passes Reborn NFT assets)
 *   3. CastVote via SPL Governance
 *
 * The transaction is returned unsigned — the wallet adapter signs + sends it.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  withCastVote,
  withCreateTokenOwnerRecord,
  Vote,
  VoteKind,
  VoteChoice,
} from "@solana/spl-governance";
import { CONTRACTS } from "./constants";

// ─── Constants ──────────────────────────────────────────────────────────────

const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

const CORE_VOTER_PROGRAM_ID = new PublicKey(CONTRACTS.solana.coreVoter);

const GOVERNANCE_PROGRAM_VERSION = 3;

// Anchor discriminators (precomputed SHA256("global:<name>")[..8])
const CREATE_VOTER_WEIGHT_RECORD_DISC = Buffer.from([
  184, 249, 133, 178, 88, 152, 250, 186,
]);
const UPDATE_VOTER_WEIGHT_RECORD_DISC = Buffer.from([
  45, 185, 3, 36, 109, 190, 115, 169,
]);

// ─── PDA Derivation ─────────────────────────────────────────────────────────

function deriveRegistrar(
  realm: PublicKey,
  communityMint: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("registrar"), realm.toBuffer(), communityMint.toBuffer()],
    CORE_VOTER_PROGRAM_ID
  )[0];
}

function deriveVoterWeightRecord(
  realm: PublicKey,
  communityMint: PublicKey,
  walletPubkey: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("voter-weight-record"),
      realm.toBuffer(),
      communityMint.toBuffer(),
      walletPubkey.toBuffer(),
    ],
    CORE_VOTER_PROGRAM_ID
  )[0];
}

function deriveMaxVoterWeightRecord(
  realm: PublicKey,
  communityMint: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("max-voter-weight-record"),
      realm.toBuffer(),
      communityMint.toBuffer(),
    ],
    CORE_VOTER_PROGRAM_ID
  )[0];
}

function deriveTokenOwnerRecord(
  realm: PublicKey,
  communityMint: PublicKey,
  walletPubkey: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("governance"),
      realm.toBuffer(),
      communityMint.toBuffer(),
      walletPubkey.toBuffer(),
    ],
    SPL_GOVERNANCE_PROGRAM_ID
  )[0];
}

// ─── Transaction Builder ────────────────────────────────────────────────────

export interface VoteParams {
  realmAddress: string;
  communityMint: string;
  governanceAddress: string;
  proposalAddress: string;
  walletPubkey: string;
  /** Reborn NFT asset addresses owned by this wallet (for voter weight) */
  rebornAssets: string[];
  voteKind: "yes" | "no" | "abstain";
}

/**
 * Build a vote transaction for SPL Governance with ika-core-voter plugin.
 *
 * Returns an unsigned Transaction that the wallet must sign and send.
 */
export async function buildVoteTransaction(
  connection: Connection,
  params: VoteParams
): Promise<Transaction> {
  const realm = new PublicKey(params.realmAddress);
  const communityMint = new PublicKey(params.communityMint);
  const governance = new PublicKey(params.governanceAddress);
  const proposal = new PublicKey(params.proposalAddress);
  const wallet = new PublicKey(params.walletPubkey);

  const registrar = deriveRegistrar(realm, communityMint);
  const voterWeightRecord = deriveVoterWeightRecord(
    realm,
    communityMint,
    wallet
  );
  const maxVoterWeightRecord = deriveMaxVoterWeightRecord(
    realm,
    communityMint
  );
  const tokenOwnerRecord = deriveTokenOwnerRecord(
    realm,
    communityMint,
    wallet
  );

  const instructions: TransactionInstruction[] = [];

  // 1. Create TokenOwnerRecord if it doesn't exist yet
  const torInfo = await connection.getAccountInfo(tokenOwnerRecord);
  if (!torInfo) {
    await withCreateTokenOwnerRecord(
      instructions,
      SPL_GOVERNANCE_PROGRAM_ID,
      GOVERNANCE_PROGRAM_VERSION,
      realm,
      wallet, // governing token owner
      communityMint,
      wallet // payer
    );
  }

  // 2. Create VoterWeightRecord if it doesn't exist
  const vwrInfo = await connection.getAccountInfo(voterWeightRecord);
  if (!vwrInfo) {
    instructions.push(
      new TransactionInstruction({
        programId: CORE_VOTER_PROGRAM_ID,
        keys: [
          { pubkey: registrar, isSigner: false, isWritable: false },
          { pubkey: voterWeightRecord, isSigner: false, isWritable: true },
          { pubkey: wallet, isSigner: true, isWritable: true }, // payer
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: CREATE_VOTER_WEIGHT_RECORD_DISC,
      })
    );
  }

  // 3. Update VoterWeightRecord (must be in same tx as vote — slot-based expiry)
  //    Pass Reborn NFT assets as remaining_accounts for ownership verification
  const assetKeys = params.rebornAssets.map((addr) => ({
    pubkey: new PublicKey(addr),
    isSigner: false,
    isWritable: false,
  }));

  instructions.push(
    new TransactionInstruction({
      programId: CORE_VOTER_PROGRAM_ID,
      keys: [
        { pubkey: registrar, isSigner: false, isWritable: false },
        { pubkey: voterWeightRecord, isSigner: false, isWritable: true },
        { pubkey: wallet, isSigner: true, isWritable: false }, // voter authority
        ...assetKeys, // remaining_accounts: NFT assets to prove ownership
      ],
      data: UPDATE_VOTER_WEIGHT_RECORD_DISC,
    })
  );

  // 4. Cast vote
  const vote =
    params.voteKind === "yes"
      ? new Vote({
          voteType: VoteKind.Approve,
          approveChoices: [new VoteChoice({ rank: 0, weightPercentage: 100 })],
          deny: undefined,
          veto: undefined,
        })
      : params.voteKind === "no"
        ? new Vote({
            voteType: VoteKind.Deny,
            approveChoices: undefined,
            deny: true,
            veto: undefined,
          })
        : new Vote({
            voteType: VoteKind.Abstain,
            approveChoices: undefined,
            deny: undefined,
            veto: undefined,
          });

  await withCastVote(
    instructions,
    SPL_GOVERNANCE_PROGRAM_ID,
    GOVERNANCE_PROGRAM_VERSION,
    realm,
    governance,
    proposal,
    tokenOwnerRecord, // proposal owner's token owner record
    tokenOwnerRecord, // voter's token owner record (same for self-vote)
    wallet, // governance authority (voter)
    communityMint,
    vote,
    wallet, // payer
    voterWeightRecord,
    maxVoterWeightRecord
  );

  const tx = new Transaction().add(...instructions);
  tx.feePayer = wallet;
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;

  return tx;
}
