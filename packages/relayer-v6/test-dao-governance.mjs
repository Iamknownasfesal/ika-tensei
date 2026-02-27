/**
 * Full E2E test: DAO Governance with Metaplex Core Voter Weight Plugin
 *
 * Simulates the complete Sui → Solana bridge + DAO flow:
 *   1. Fund 5 voter wallets
 *   2. Create Metaplex Core collection (reborn collection)
 *   3. Create Realm with voter weight plugin
 *   4. Configure voter plugin for the collection
 *   5. Mint 5 Core NFTs to 5 different wallets (bridge output)
 *   6. Register all voters (TokenOwnerRecord + VoterWeightRecord)
 *   7. Create a governance proposal
 *   8. Cast votes: 3 YES, 2 NO
 *   9. Finalize and display results
 *
 * Prerequisites:
 *   - relayer-keypair.json in cwd
 *   - ika-core-voter deployed (E5thJCWofTMbmyhUhCai3hZiruFtYmmscDio6GwFCGaW)
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
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
  withCreateTokenOwnerRecord,
  withCreateProposal,
  withSignOffProposal,
  withCastVote,
  withFinalizeVote,
  getProposal,
  GovernanceConfig,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  MintMaxVoteWeightSource,
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
  VoteType,
  Vote,
  VoteKind,
  VoteChoice,
  YesNoVote,
} from '@solana/spl-governance';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createCollection, create, transfer, fetchCollectionV1, mplCore } from '@metaplex-foundation/mpl-core';
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import BN from 'bn.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const SOLANA_RPC = 'https://api.devnet.solana.com';
const CORE_VOTER_PROGRAM_ID = new PublicKey('E5thJCWofTMbmyhUhCai3hZiruFtYmmscDio6GwFCGaW');
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const GOVERNANCE_PROGRAM_VERSION = 3;

// Load relayer keypair
const keypairData = JSON.parse(readFileSync('./relayer-keypair.json', 'utf-8'));
const relayerKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
const conn = new Connection(SOLANA_RPC, 'confirmed');

// Set up Umi
const umi = createUmi(SOLANA_RPC, 'confirmed').use(mplCore());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(keypairData));
umi.use(keypairIdentity(umiKeypair));

// ─── Voter Definitions ──────────────────────────────────────────────────────

const VOTERS = [
  { name: 'Alice',   vote: 'YES' },
  { name: 'Bob',     vote: 'YES' },
  { name: 'Charlie', vote: 'YES' },
  { name: 'Diana',   vote: 'NO'  },
  { name: 'Eve',     vote: 'NO'  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function anchorDisc(name) {
  return createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main Test ───────────────────────────────────────────────────────────────

async function main() {
  const payer = relayerKeypair.publicKey;
  const collectionName = `Milady-Reborn-${Date.now().toString(36)}`;
  const realmName = `Reborn: ${collectionName}`;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        REBORN DAO GOVERNANCE — FULL E2E TEST               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Relayer:    ${payer.toBase58()}`);
  console.log(`  Collection: ${collectionName}`);
  console.log(`  Realm:      ${realmName}`);

  const balance = await conn.getBalance(payer);
  console.log(`  Balance:    ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Step 1: Generate & fund 5 voter wallets
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 1: Generating and funding 5 voter wallets...');

  const voters = VOTERS.map(v => ({
    ...v,
    keypair: Keypair.generate(),
  }));

  // Fund all 5 voters from relayer wallet (0.05 SOL each)
  const fundIxs = voters.map(v =>
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: v.keypair.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  const fundTx = new Transaction().add(...fundIxs);
  await sendAndConfirmTransaction(conn, fundTx, [relayerKeypair]);

  for (const v of voters) {
    console.log(`  ${v.name.padEnd(8)} ${v.keypair.publicKey.toBase58()} (${v.vote})`);
  }
  console.log('  Funded 5 voters with 0.05 SOL each\n');

  // ════════════════════════════════════════════════════════════════════════════
  // Step 2: Create Metaplex Core collection
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 2: Creating Metaplex Core collection...');

  const collectionSigner = generateSigner(umi);
  await createCollection(umi, {
    collection: collectionSigner,
    name: collectionName,
    uri: 'https://ika-tensei.io/collections/milady-reborn',
  }).sendAndConfirm(umi);

  const collectionPubkey = new PublicKey(collectionSigner.publicKey.toString());
  console.log(`  Collection: ${collectionPubkey.toBase58()}\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Step 3: Create Realm with voter weight plugin
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 3: Creating Realm + Governance + Treasury...');

  const councilMintKeypair = Keypair.generate();
  const communityMintKeypair = Keypair.generate();
  const mintSpace = getMintLen([]);
  const mintRent = await conn.getMinimumBalanceForRentExemption(mintSpace);

  // Tx A: Create mints + realm + deposit council token
  const realmIxs = [];

  // Council mint
  realmIxs.push(
    SystemProgram.createAccount({
      fromPubkey: payer, newAccountPubkey: councilMintKeypair.publicKey,
      space: mintSpace, lamports: mintRent, programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(councilMintKeypair.publicKey, 0, payer, null),
  );

  // Community mint (placeholder — voting power from plugin)
  realmIxs.push(
    SystemProgram.createAccount({
      fromPubkey: payer, newAccountPubkey: communityMintKeypair.publicKey,
      space: mintSpace, lamports: mintRent, programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(communityMintKeypair.publicKey, 0, payer, null),
  );

  // Mint 1 council token to relayer
  const relayerCouncilAta = getAssociatedTokenAddressSync(councilMintKeypair.publicKey, payer);
  realmIxs.push(
    createAssociatedTokenAccountInstruction(payer, relayerCouncilAta, payer, councilMintKeypair.publicKey),
    createMintToInstruction(councilMintKeypair.publicKey, relayerCouncilAta, payer, 1),
  );

  // Create Realm with voter weight addin
  const communityTokenConfig = new GoverningTokenConfigAccountArgs({
    voterWeightAddin: CORE_VOTER_PROGRAM_ID,
    maxVoterWeightAddin: CORE_VOTER_PROGRAM_ID,
    tokenType: GoverningTokenType.Membership,
  });

  const realmAddress = await withCreateRealm(
    realmIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmName, payer, communityMintKeypair.publicKey, payer,
    councilMintKeypair.publicKey,
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION, new BN(1),
    communityTokenConfig,
  );

  // Deposit council token
  const relayerTor = await withDepositGoverningTokens(
    realmIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmAddress, relayerCouncilAta, councilMintKeypair.publicKey,
    payer, payer, payer, new BN(1),
  );

  const txA = new Transaction().add(...realmIxs);
  await sendAndConfirmTransaction(conn, txA, [
    relayerKeypair, councilMintKeypair, communityMintKeypair,
  ]);

  console.log(`  Realm:          ${realmAddress.toBase58()}`);
  console.log(`  Council mint:   ${councilMintKeypair.publicKey.toBase58()}`);
  console.log(`  Community mint: ${communityMintKeypair.publicKey.toBase58()}`);

  // Tx B: Create governance + treasury
  const govIxs = [];
  const governanceConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({ type: VoteThresholdType.YesVotePercentage, value: 60 }),
    minCommunityTokensToCreateProposal: new BN(1),
    minInstructionHoldUpTime: 0,
    baseVotingTime: 3600, // 1 hour (SDK minimum); Early tipping resolves sooner
    communityVoteTipping: VoteTipping.Early,
    minCouncilTokensToCreateProposal: new BN(1),
    councilVoteThreshold: new VoteThreshold({ type: VoteThresholdType.YesVotePercentage, value: 60 }),
    councilVetoVoteThreshold: new VoteThreshold({ type: VoteThresholdType.Disabled }),
    communityVetoVoteThreshold: new VoteThreshold({ type: VoteThresholdType.Disabled }),
    councilVoteTipping: VoteTipping.Strict,
    votingCoolOffTime: 0,
    depositExemptProposalCount: 10,
  });

  const governanceAddress = await withCreateGovernance(
    govIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmAddress, realmAddress, governanceConfig, relayerTor, payer, payer,
  );

  const treasuryAddress = await withCreateNativeTreasury(
    govIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    governanceAddress, payer,
  );

  const txB = new Transaction().add(...govIxs);
  await sendAndConfirmTransaction(conn, txB, [relayerKeypair]);

  console.log(`  Governance:     ${governanceAddress.toBase58()}`);
  console.log(`  Treasury:       ${treasuryAddress.toBase58()}\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Step 4: Configure voter weight plugin
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 4: Configuring voter weight plugin...');

  const registrar = PublicKey.findProgramAddressSync(
    [Buffer.from('registrar'), realmAddress.toBuffer(), communityMintKeypair.publicKey.toBuffer()],
    CORE_VOTER_PROGRAM_ID,
  )[0];

  const maxVwrPda = PublicKey.findProgramAddressSync(
    [Buffer.from('max-voter-weight-record'), realmAddress.toBuffer(), communityMintKeypair.publicKey.toBuffer()],
    CORE_VOTER_PROGRAM_ID,
  )[0];

  const pluginIxs = [];

  // create_registrar
  pluginIxs.push(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: registrar, isSigner: false, isWritable: true },
      { pubkey: SPL_GOVERNANCE_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: realmAddress, isSigner: false, isWritable: false },
      { pubkey: communityMintKeypair.publicKey, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: anchorDisc('create_registrar'),
  }));

  // configure_collection (collection + weight=1)
  const configData = Buffer.alloc(8 + 32 + 8);
  anchorDisc('configure_collection').copy(configData);
  collectionPubkey.toBuffer().copy(configData, 8);
  configData.writeUInt32LE(1, 40); // weight = 1
  configData.writeUInt32LE(0, 44);

  pluginIxs.push(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: registrar, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
    ],
    data: configData,
  }));

  // create_max_voter_weight_record (max_weight = 5, matching our 5 voters)
  const maxVwrData = Buffer.alloc(8 + 8);
  anchorDisc('create_max_voter_weight_record').copy(maxVwrData);
  maxVwrData.writeUInt32LE(5, 8); // max_voter_weight = 5
  maxVwrData.writeUInt32LE(0, 12);

  pluginIxs.push(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: maxVwrPda, isSigner: false, isWritable: true },
      { pubkey: realmAddress, isSigner: false, isWritable: false },
      { pubkey: communityMintKeypair.publicKey, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: maxVwrData,
  }));

  const txC = new Transaction().add(...pluginIxs);
  await sendAndConfirmTransaction(conn, txC, [relayerKeypair]);

  console.log(`  Registrar:           ${registrar.toBase58()}`);
  console.log(`  MaxVoterWeightRecord: ${maxVwrPda.toBase58()}\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Step 5: Mint 5 Core NFTs (simulating 5 bridge operations)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 5: Minting 5 Core NFTs (Sui → Solana bridge simulation)...');

  // Fetch the collection object (required by high-level create wrapper)
  const collectionObj = await fetchCollectionV1(umi, collectionSigner.publicKey);

  const nftAssets = [];
  for (let i = 0; i < voters.length; i++) {
    const v = voters[i];
    const assetSigner = generateSigner(umi);

    // Mint to relayer, then transfer to voter
    await create(umi, {
      asset: assetSigner,
      name: `Reborn Milady #${i + 1}`,
      uri: `https://ika-tensei.io/nfts/milady/${i + 1}`,
      collection: collectionObj,
    }).sendAndConfirm(umi);

    // Transfer to the voter's wallet
    // Refetch asset state for transfer (owner is identity after mint)
    await transfer(umi, {
      asset: {
        publicKey: assetSigner.publicKey,
        owner: umi.identity.publicKey,
        oracles: [],
        lifecycleHooks: [],
      },
      collection: collectionObj,
      newOwner: publicKey(v.keypair.publicKey.toBase58()),
    }).sendAndConfirm(umi);

    const assetPubkey = new PublicKey(assetSigner.publicKey.toString());
    nftAssets.push(assetPubkey);
    console.log(`  ${v.name.padEnd(8)} -> Reborn Milady #${i + 1} (${assetPubkey.toBase58().slice(0, 12)}...)`);
  }

  // Verify one asset's binary layout
  const sampleAsset = await conn.getAccountInfo(nftAssets[0]);
  const uaDisc = sampleAsset.data[33];
  console.log(`  Collection membership: UA discriminant = ${uaDisc} ${uaDisc === 2 ? '(Collection OK)' : '(ERROR!)'}\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Step 6: Register all voters (TokenOwnerRecord + VoterWeightRecord)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 6: Registering 5 voters...');

  const voterTors = [];
  const voterVwrs = [];

  for (let i = 0; i < voters.length; i++) {
    const v = voters[i];
    const voterPubkey = v.keypair.publicKey;

    // Create TokenOwnerRecord (Membership type — no deposit needed)
    const torIxs = [];
    const tor = await withCreateTokenOwnerRecord(
      torIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
      realmAddress, voterPubkey, communityMintKeypair.publicKey, payer,
    );
    voterTors.push(tor);

    // Create VoterWeightRecord (PDA: voter-weight-record/realm/mint/voter)
    const vwrPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from('voter-weight-record'),
        realmAddress.toBuffer(),
        communityMintKeypair.publicKey.toBuffer(),
        voterPubkey.toBuffer(),
      ],
      CORE_VOTER_PROGRAM_ID,
    )[0];
    voterVwrs.push(vwrPda);

    torIxs.push(new TransactionInstruction({
      programId: CORE_VOTER_PROGRAM_ID,
      keys: [
        { pubkey: vwrPda, isSigner: false, isWritable: true },
        { pubkey: realmAddress, isSigner: false, isWritable: false },
        { pubkey: communityMintKeypair.publicKey, isSigner: false, isWritable: false },
        { pubkey: voterPubkey, isSigner: false, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: anchorDisc('create_voter_weight_record'),
    }));

    const torTx = new Transaction().add(...torIxs);
    await sendAndConfirmTransaction(conn, torTx, [relayerKeypair]);
    console.log(`  ${v.name.padEnd(8)} TOR: ${tor.toBase58().slice(0, 12)}...  VWR: ${vwrPda.toBase58().slice(0, 12)}...`);
  }
  console.log();

  // ════════════════════════════════════════════════════════════════════════════
  // Step 7: Create proposal (Voter 0 / Alice creates it)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 7: Creating governance proposal...');

  const proposer = voters[0];
  const proposerPubkey = proposer.keypair.publicKey;
  const proposerTor = voterTors[0];
  const proposerVwr = voterVwrs[0];

  // Build: update VWR + create proposal (same tx for expiry)
  const proposalIxs = [];

  // Update VWR for the proposer (passes their NFT as remaining_account)
  proposalIxs.push(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: registrar, isSigner: false, isWritable: false },
      { pubkey: proposerVwr, isSigner: false, isWritable: true },
      { pubkey: proposerPubkey, isSigner: true, isWritable: false },
      { pubkey: nftAssets[0], isSigner: false, isWritable: false },
    ],
    data: anchorDisc('update_voter_weight_record'),
  }));

  // Create the proposal
  const proposalAddress = await withCreateProposal(
    proposalIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmAddress, governanceAddress, proposerTor,
    'Fund DAO treasury with 1 SOL for community marketing',
    'https://ika-tensei.io/proposals/marketing-fund',
    communityMintKeypair.publicKey,
    proposerPubkey,
    0, // proposalIndex
    VoteType.SINGLE_CHOICE,
    ['Approve'],
    true, // useDenyOption
    payer,
    proposerVwr, // voter weight record for proposal creation
  );

  const proposalTx = new Transaction().add(...proposalIxs);
  const proposalSig = await sendAndConfirmTransaction(conn, proposalTx, [
    relayerKeypair, proposer.keypair,
  ]);
  console.log(`  Proposal: ${proposalAddress.toBase58()}`);
  console.log(`  Title:    "Fund DAO treasury with 1 SOL for community marketing"`);
  console.log(`  Creator:  ${proposer.name}`);
  console.log(`  Tx:       ${proposalSig}\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Step 8: Sign off proposal (make it votable)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 8: Signing off proposal (Draft → Voting)...');

  const signOffIxs = [];
  withSignOffProposal(
    signOffIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmAddress, governanceAddress, proposalAddress,
    proposerPubkey, undefined, proposerTor,
  );

  const signOffTx = new Transaction().add(...signOffIxs);
  await sendAndConfirmTransaction(conn, signOffTx, [relayerKeypair, proposer.keypair]);
  console.log('  Proposal is now in Voting state\n');

  // ════════════════════════════════════════════════════════════════════════════
  // Step 9: Cast votes (3 YES, 2 NO)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 9: Casting votes...');
  console.log('  Voting order: Alice(YES), Diana(NO), Bob(YES), Eve(NO), Charlie(YES)\n');

  // Interleave YES/NO to show both sides
  const voteOrder = [0, 3, 1, 4, 2]; // Alice, Diana, Bob, Eve, Charlie

  for (const idx of voteOrder) {
    const v = voters[idx];
    const voterPubkey = v.keypair.publicKey;
    const voterTor = voterTors[idx];
    const voterVwr = voterVwrs[idx];
    const nftAsset = nftAssets[idx];
    const isYes = v.vote === 'YES';

    const voteIxs = [];

    // Update VWR (same tx as vote for expiry)
    voteIxs.push(new TransactionInstruction({
      programId: CORE_VOTER_PROGRAM_ID,
      keys: [
        { pubkey: registrar, isSigner: false, isWritable: false },
        { pubkey: voterVwr, isSigner: false, isWritable: true },
        { pubkey: voterPubkey, isSigner: true, isWritable: false },
        { pubkey: nftAsset, isSigner: false, isWritable: false },
      ],
      data: anchorDisc('update_voter_weight_record'),
    }));

    // Cast vote
    const vote = isYes
      ? new Vote({ voteType: VoteKind.Approve, approveChoices: [new VoteChoice({ rank: 0, weightPercentage: 100 })], deny: undefined, veto: undefined })
      : new Vote({ voteType: VoteKind.Deny, approveChoices: undefined, deny: true, veto: undefined });

    await withCastVote(
      voteIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
      realmAddress, governanceAddress, proposalAddress,
      proposerTor, // proposal owner's TOR
      voterTor,    // voter's TOR
      voterPubkey, // governance authority (voter)
      communityMintKeypair.publicKey,
      vote,
      payer,
      voterVwr,    // voter weight record
      maxVwrPda,   // max voter weight record
    );

    const voteTx = new Transaction().add(...voteIxs);
    const voteSig = await sendAndConfirmTransaction(conn, voteTx, [
      relayerKeypair, v.keypair,
    ]);
    console.log(`  ${v.name.padEnd(8)} voted ${v.vote.padEnd(3)} | weight: 1 | tx: ${voteSig.slice(0, 20)}...`);
  }
  console.log();

  // ════════════════════════════════════════════════════════════════════════════
  // Step 10: Check if early tipping resolved the vote, finalize if needed
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 10: Checking proposal state...');

  let proposalCheck = await getProposal(conn, proposalAddress);
  console.log(`  Current state: ${proposalCheck.account.state} (${['Draft','SigningOff','Voting','Succeeded','Executing','Completed','Cancelled','Defeated'][proposalCheck.account.state]})`);

  if (proposalCheck.account.state === 2) { // Still Voting
    console.log('  Proposal still in Voting — attempting finalize...');
    try {
      const finalizeIxs = [];
      await withFinalizeVote(
        finalizeIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
        realmAddress, governanceAddress, proposalAddress,
        proposerTor,
        communityMintKeypair.publicKey,
        maxVwrPda,
      );

      const finalizeTx = new Transaction().add(...finalizeIxs);
      await sendAndConfirmTransaction(conn, finalizeTx, [relayerKeypair]);
      console.log('  Finalized manually');
    } catch (err) {
      console.log(`  Finalize skipped (early tipping may have resolved it): ${err.message?.slice(0, 80)}`);
    }
  } else {
    console.log('  Vote was resolved via early tipping — no finalize needed');
  }
  console.log();

  // ════════════════════════════════════════════════════════════════════════════
  // Step 11: Read and display results
  // ════════════════════════════════════════════════════════════════════════════
  console.log('Step 11: Reading proposal results...\n');

  const proposalAccount = await getProposal(conn, proposalAddress);
  const proposal = proposalAccount.account;

  const stateNames = [
    'Draft', 'SigningOff', 'Voting', 'Succeeded', 'Executing',
    'Completed', 'Cancelled', 'Defeated', 'ExecutingWithErrors', 'Vetoed',
  ];

  const yesWeight = proposal.options[0]?.voteWeight?.toNumber() || 0;
  const noWeight = proposal.denyVoteWeight?.toNumber() || 0;
  const totalVotes = yesWeight + noWeight;
  const yesPercent = totalVotes > 0 ? ((yesWeight / totalVotes) * 100).toFixed(1) : '0';
  const noPercent = totalVotes > 0 ? ((noWeight / totalVotes) * 100).toFixed(1) : '0';
  const threshold = 60;
  const passed = proposal.state === 3; // Succeeded

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    GOVERNANCE RESULTS                       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Proposal: "${proposal.name.slice(0, 50)}"`);
  console.log(`║  State:    ${stateNames[proposal.state] || 'Unknown'}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  YES: ${yesWeight} votes (${yesPercent}%)  — Alice, Bob, Charlie`);
  console.log(`║  NO:  ${noWeight} votes (${noPercent}%)  — Diana, Eve`);
  console.log(`║  Total: ${totalVotes} / 5 voted`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Threshold: ${threshold}% YES required`);
  console.log(`║  Result:    ${passed ? 'PASSED' : 'DEFEATED'} (${yesPercent}% >= ${threshold}%: ${Number(yesPercent) >= threshold})`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Realm:      ${realmAddress.toBase58()}`);
  console.log(`║  Governance: ${governanceAddress.toBase58()}`);
  console.log(`║  Treasury:   ${treasuryAddress.toBase58()}`);
  console.log(`║  Collection: ${collectionPubkey.toBase58()}`);
  console.log(`║  Registrar:  ${registrar.toBase58()}`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Realms UI:  https://app.realms.today/dao/${realmAddress.toBase58()}?cluster=devnet`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!passed) {
    console.log('WARNING: Proposal did not pass — check governance configuration');
    process.exit(1);
  }

  console.log('E2E TEST PASSED: Full DAO governance flow verified.');
}

main().catch(err => {
  console.error('\nE2E test failed:', err);
  process.exit(1);
});
