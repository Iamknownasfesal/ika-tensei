/**
 * E2E test for Realm creation + Core voter weight plugin.
 *
 * Tests the full flow:
 *   1. Create a Metaplex Core collection (via Umi SDK)
 *   2. Create Realm with voter weight plugin (Phase 1)
 *   3. Configure voter plugin with the collection (Phase 2)
 *   4. Mint a Core NFT to the relayer wallet
 *   5. Create VoterWeightRecord for the NFT holder
 *   6. Update VoterWeightRecord (verify weight = 1)
 *
 * Prerequisites:
 *   - relayer-keypair.json available
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
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createCollection, create, fetchCollectionV1, mplCore } from '@metaplex-foundation/mpl-core';
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import BN from 'bn.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const SOLANA_RPC = 'https://api.devnet.solana.com';
const CORE_VOTER_PROGRAM_ID = new PublicKey('E5thJCWofTMbmyhUhCai3hZiruFtYmmscDio6GwFCGaW');
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const GOVERNANCE_PROGRAM_VERSION = 3;

// Load keypair
const keypairData = JSON.parse(readFileSync('./relayer-keypair.json', 'utf-8'));
const relayerKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
const conn = new Connection(SOLANA_RPC, 'confirmed');

// Set up Umi
const umi = createUmi(SOLANA_RPC, 'confirmed').use(mplCore());
const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(keypairData));
umi.use(keypairIdentity(umiKeypair));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function anchorDisc(name) {
  return createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

// ─── Main Test ───────────────────────────────────────────────────────────────

async function main() {
  const payer = relayerKeypair.publicKey;
  const collectionName = `TestColl-${Date.now().toString(36)}`;
  const realmName = `Reborn: ${collectionName}`;

  console.log('=== E2E Test: Realm + Core Voter Plugin ===\n');
  console.log('  Payer:', payer.toBase58());
  console.log('  Collection name:', collectionName);
  console.log('  Realm name:', realmName);

  const balance = await conn.getBalance(payer);
  console.log('  Balance:', balance / 1e9, 'SOL\n');

  // ── Step 1: Create Metaplex Core Collection (via Umi) ───────────────────
  console.log('Step 1: Creating Metaplex Core collection...');

  const collectionSigner = generateSigner(umi);
  await createCollection(umi, {
    collection: collectionSigner,
    name: collectionName,
    uri: 'https://ika-tensei.io/test-collection',
  }).sendAndConfirm(umi);

  const collectionPubkey = new PublicKey(collectionSigner.publicKey.toString());
  console.log('  Collection:', collectionPubkey.toBase58());

  // ── Step 2: Create Realm with voter weight plugin (Phase 1) ─────────────
  console.log('\nStep 2: Creating Realm with council + community (voter weight plugin)...');

  const councilMintKeypair = Keypair.generate();
  const communityMintKeypair = Keypair.generate();
  const mintSpace = getMintLen([]);
  const mintRent = await conn.getMinimumBalanceForRentExemption(mintSpace);

  const realmIxs = [];

  // Create + init council mint
  realmIxs.push(
    SystemProgram.createAccount({
      fromPubkey: payer, newAccountPubkey: councilMintKeypair.publicKey,
      space: mintSpace, lamports: mintRent, programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(councilMintKeypair.publicKey, 0, payer, null),
  );

  // Create + init community mint
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

  // Create Realm with voter weight addin on community token
  const communityTokenConfig = new GoverningTokenConfigAccountArgs({
    voterWeightAddin: CORE_VOTER_PROGRAM_ID,
    maxVoterWeightAddin: CORE_VOTER_PROGRAM_ID,
    tokenType: GoverningTokenType.Membership,
  });

  const realmAddress = await withCreateRealm(
    realmIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmName, payer, communityMintKeypair.publicKey, payer,
    councilMintKeypair.publicKey,
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    new BN(1),
    communityTokenConfig,
  );

  // Deposit council token → creates TokenOwnerRecord
  const tokenOwnerRecord = await withDepositGoverningTokens(
    realmIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    realmAddress, relayerCouncilAta, councilMintKeypair.publicKey,
    payer, payer, payer, new BN(1),
  );

  const tx2 = new Transaction().add(...realmIxs);
  const tx2Sig = await sendAndConfirmTransaction(conn, tx2, [
    relayerKeypair, councilMintKeypair, communityMintKeypair,
  ]);
  console.log('  Realm:', realmAddress.toBase58());
  console.log('  Council mint:', councilMintKeypair.publicKey.toBase58());
  console.log('  Community mint:', communityMintKeypair.publicKey.toBase58());
  console.log('  Tx:', tx2Sig);

  // Create Governance + NativeTreasury (tx3)
  console.log('  Creating Governance + Treasury...');
  const govIxs = [];

  const governanceConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({ type: VoteThresholdType.YesVotePercentage, value: 60 }),
    minCommunityTokensToCreateProposal: new BN(1),
    minInstructionHoldUpTime: 0,
    baseVotingTime: 3 * 24 * 60 * 60,
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
    realmAddress, realmAddress, governanceConfig, tokenOwnerRecord, payer, payer,
  );

  const treasuryAddress = await withCreateNativeTreasury(
    govIxs, SPL_GOVERNANCE_PROGRAM_ID, GOVERNANCE_PROGRAM_VERSION,
    governanceAddress, payer,
  );

  const tx3 = new Transaction().add(...govIxs);
  const tx3Sig = await sendAndConfirmTransaction(conn, tx3, [relayerKeypair]);
  console.log('  Governance:', governanceAddress.toBase58());
  console.log('  Treasury:', treasuryAddress.toBase58());
  console.log('  Tx:', tx3Sig);

  // ── Step 3: Configure voter plugin (Phase 2) ───────────────────────────
  console.log('\nStep 3: Configuring voter plugin (registrar + collection)...');

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

  // configure_collection (collection pubkey + weight u64)
  const configData = Buffer.alloc(8 + 32 + 8);
  anchorDisc('configure_collection').copy(configData);
  collectionPubkey.toBuffer().copy(configData, 8);
  configData.writeUInt32LE(1, 40);
  configData.writeUInt32LE(0, 44);

  pluginIxs.push(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: registrar, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
    ],
    data: configData,
  }));

  // create_max_voter_weight_record (max_voter_weight u64)
  const maxVwrData = Buffer.alloc(8 + 8);
  anchorDisc('create_max_voter_weight_record').copy(maxVwrData);
  maxVwrData.writeUInt32LE(10000, 8);
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

  const tx4 = new Transaction().add(...pluginIxs);
  const tx4Sig = await sendAndConfirmTransaction(conn, tx4, [relayerKeypair]);
  console.log('  Registrar:', registrar.toBase58());
  console.log('  MaxVoterWeightRecord:', maxVwrPda.toBase58());
  console.log('  Tx:', tx4Sig);

  // ── Step 4: Mint a Core NFT (via Umi) ──────────────────────────────────
  console.log('\nStep 4: Minting Core NFT to relayer wallet...');

  const collectionObj = await fetchCollectionV1(umi, collectionSigner.publicKey);
  const assetSigner = generateSigner(umi);
  await create(umi, {
    asset: assetSigner,
    name: 'Test Reborn #1',
    uri: 'https://ika-tensei.io/test/1',
    collection: collectionObj,
  }).sendAndConfirm(umi);

  const assetPubkey = new PublicKey(assetSigner.publicKey.toString());
  console.log('  Asset:', assetPubkey.toBase58());

  // Verify Core asset binary layout
  const assetInfo = await conn.getAccountInfo(assetPubkey);
  if (!assetInfo) {
    console.error('  ERROR: Asset account not found!');
    process.exit(1);
  }

  const key = assetInfo.data[0];
  const owner = new PublicKey(assetInfo.data.slice(1, 33));
  const uaDisc = assetInfo.data[33];
  const uaPubkey = new PublicKey(assetInfo.data.slice(34, 66));
  console.log('  Key:', key, key === 1 ? '(AssetV1 ✓)' : '(UNEXPECTED ✗)');
  console.log('  Owner:', owner.toBase58(), owner.equals(payer) ? '✓' : '✗');
  console.log('  UA discriminant:', uaDisc, uaDisc === 2 ? '(Collection ✓)' : '(UNEXPECTED ✗)');
  console.log('  UA pubkey:', uaPubkey.toBase58(), uaPubkey.equals(collectionPubkey) ? '✓' : '✗');

  // ── Step 5: Create VoterWeightRecord ────────────────────────────────────
  console.log('\nStep 5: Creating VoterWeightRecord...');

  const vwrPda = PublicKey.findProgramAddressSync(
    [
      Buffer.from('voter-weight-record'),
      realmAddress.toBuffer(),
      communityMintKeypair.publicKey.toBuffer(),
      payer.toBuffer(),
    ],
    CORE_VOTER_PROGRAM_ID,
  )[0];

  const tx6 = new Transaction().add(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: vwrPda, isSigner: false, isWritable: true },
      { pubkey: realmAddress, isSigner: false, isWritable: false },
      { pubkey: communityMintKeypair.publicKey, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: anchorDisc('create_voter_weight_record'),
  }));

  const tx6Sig = await sendAndConfirmTransaction(conn, tx6, [relayerKeypair]);
  console.log('  VoterWeightRecord:', vwrPda.toBase58());
  console.log('  Tx:', tx6Sig);

  // ── Step 6: Update VoterWeightRecord (count NFTs) ──────────────────────
  console.log('\nStep 6: Updating VoterWeightRecord (counting NFTs)...');

  const tx7 = new Transaction().add(new TransactionInstruction({
    programId: CORE_VOTER_PROGRAM_ID,
    keys: [
      { pubkey: registrar, isSigner: false, isWritable: false },
      { pubkey: vwrPda, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
      // remaining_accounts: the NFT asset
      { pubkey: assetPubkey, isSigner: false, isWritable: false },
    ],
    data: anchorDisc('update_voter_weight_record'),
  }));

  const tx7Sig = await sendAndConfirmTransaction(conn, tx7, [relayerKeypair]);
  console.log('  Tx:', tx7Sig);

  // Read VoterWeightRecord and verify weight
  const vwrInfo = await conn.getAccountInfo(vwrPda);
  if (!vwrInfo) {
    console.error('  ERROR: VoterWeightRecord not found!');
    process.exit(1);
  }

  // Parse: discriminator(8) + realm(32) + governing_token_mint(32) + governing_token_owner(32) + voter_weight(u64)
  const voterWeight = vwrInfo.data.readBigUInt64LE(8 + 32 + 32 + 32);
  console.log('  Voter weight:', voterWeight.toString(), voterWeight === 1n ? '✓ (1 NFT = 1 vote)' : '✗ UNEXPECTED');

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n=== Results ===');
  console.log('  Realm:', realmAddress.toBase58());
  console.log('  Realm URL:', `https://app.realms.today/dao/${realmAddress.toBase58()}?cluster=devnet`);
  console.log('  Governance:', governanceAddress.toBase58());
  console.log('  Treasury:', treasuryAddress.toBase58());
  console.log('  Registrar:', registrar.toBase58());
  console.log('  Collection:', collectionPubkey.toBase58());
  console.log('  NFT Asset:', assetPubkey.toBase58());
  console.log('  Voter Weight:', voterWeight.toString());
  console.log('\n=== E2E Test Complete ===');
}

main().catch(err => {
  console.error('\nE2E test failed:', err);
  process.exit(1);
});
