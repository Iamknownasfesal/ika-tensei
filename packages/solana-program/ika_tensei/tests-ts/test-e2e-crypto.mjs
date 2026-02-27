import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, Ed25519Program, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import nacl from "tweetnacl";

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa");
const connection = new Connection("http://localhost:8899", "confirmed");
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8"))));

function findPda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

// Anchor discriminators
function disc(name) {
  return Buffer.from(createHash("sha256").update(`global:${name}`).digest()).subarray(0, 8);
}

console.log("=== E2E Crypto Test: Ed25519 Signature Verification ===\n");

// Step 1: Initialize
const [configPda] = findPda([Buffer.from("ika_config")]);
const guildTreasury = Keypair.generate().publicKey;
const teamTreasury = Keypair.generate().publicKey;

try {
  const initData = Buffer.alloc(8 + 32 + 32 + 2 + 8);
  let offset = 0;
  disc("initialize").copy(initData, offset); offset += 8;
  guildTreasury.toBuffer().copy(initData, offset); offset += 32;
  teamTreasury.toBuffer().copy(initData, offset); offset += 32;
  initData.writeUInt16LE(500, offset); offset += 2; // guild_share_bps
  initData.writeBigUInt64LE(1000000n, offset); offset += 8; // mint_fee

  const initIx = new TransactionInstruction({
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: initData,
  });
  
  const initTx = new Transaction().add(initIx);
  await sendAndConfirmTransaction(connection, initTx, [wallet]);
  console.log("✅ Initialized");
} catch (e) {
  if (e.message?.includes("already in use")) {
    console.log("⚠️  Already initialized, skipping");
  } else {
    throw e;
  }
}

// Step 2: Register collection
const sourceChain = 1; // Ethereum
const sourceContract = Buffer.from("0x1234abcd", "utf8"); // keep short for PDA seed limit
const [collectionPda] = findPda([
  Buffer.from("collection"),
  Buffer.from(new Uint16Array([sourceChain]).buffer),
  sourceContract,
]);

try {
  const regData = Buffer.alloc(500);
  let off = 0;
  disc("register_collection").copy(regData, off); off += 8;
  regData.writeUInt16LE(sourceChain, off); off += 2;
  // source_contract vec
  regData.writeUInt32LE(sourceContract.length, off); off += 4;
  sourceContract.copy(regData, off); off += sourceContract.length;
  // name string
  const name = Buffer.from("Test Collection");
  regData.writeUInt32LE(name.length, off); off += 4;
  name.copy(regData, off); off += name.length;
  // max_supply u64
  regData.writeBigUInt64LE(0n, off); off += 8; // 0 = unlimited

  const regIx = new TransactionInstruction({
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: collectionPda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: regData.subarray(0, off),
  });

  const regTx = new Transaction().add(regIx);
  await sendAndConfirmTransaction(connection, regTx, [wallet]);
  console.log("✅ Collection registered");
} catch (e) {
  if (e.message?.includes("already in use")) {
    console.log("⚠️  Collection already registered, skipping");
  } else {
    throw e;
  }
}

// Step 3: Generate dWallet keypair (simulating IKA Ed25519 dWallet)
const dwalletKeypair = nacl.sign.keyPair();
const attestationPubkey = new PublicKey(dwalletKeypair.publicKey);

// Step 4: Create seal_hash and sign it
const tokenId = Buffer.from("12345");
const sealData = Buffer.concat([
  Buffer.from(new Uint16Array([sourceChain]).buffer), // source_chain
  Buffer.from(new Uint16Array([3]).buffer), // dest_chain (Solana)
  Buffer.from([sourceContract.length]), // contract_len
  sourceContract,
  Buffer.from([tokenId.length]), // token_id_len
  tokenId,
  Buffer.from(dwalletKeypair.publicKey), // attestation_pubkey
  Buffer.from(new BigUint64Array([1n]).buffer), // nonce
]);
const sealHash = createHash("sha256").update(sealData).digest();

// Sign the seal_hash with the dWallet private key
const signature = nacl.sign.detached(sealHash, dwalletKeypair.secretKey);
console.log(`\n📝 Seal hash: ${sealHash.toString("hex")}`);
console.log(`🔑 dWallet pubkey: ${attestationPubkey.toBase58()}`);
console.log(`✍️  Signature: ${Buffer.from(signature).toString("hex").substring(0, 40)}...`);

// Step 5: Build verify_seal transaction with Ed25519 precompile
const [recordPda] = findPda([Buffer.from("reincarnation"), sealHash]);
const recipient = Keypair.generate().publicKey;

// Ed25519 precompile instruction
const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
  publicKey: dwalletKeypair.publicKey,
  message: sealHash,
  signature: signature,
});

// verify_seal instruction
const verifySealData = Buffer.alloc(500);
let voff = 0;
disc("verify_seal").copy(verifySealData, voff); voff += 8;
// seal_hash [u8; 32]
sealHash.copy(verifySealData, voff); voff += 32;
// source_chain u16
verifySealData.writeUInt16LE(sourceChain, voff); voff += 2;
// source_contract vec
verifySealData.writeUInt32LE(sourceContract.length, voff); voff += 4;
sourceContract.copy(verifySealData, voff); voff += sourceContract.length;
// token_id vec
verifySealData.writeUInt32LE(tokenId.length, voff); voff += 4;
tokenId.copy(verifySealData, voff); voff += tokenId.length;
// attestation_pubkey Pubkey
Buffer.from(attestationPubkey.toBytes()).copy(verifySealData, voff); voff += 32;
// recipient Pubkey
recipient.toBuffer().copy(verifySealData, voff); voff += 32;

const verifySealIx = new TransactionInstruction({
  keys: [
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: collectionPda, isSigner: false, isWritable: true },
    { pubkey: recordPda, isSigner: false, isWritable: true },
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("Sysvar1nstructions1111111111111111111111111"), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  programId: PROGRAM_ID,
  data: verifySealData.subarray(0, voff),
});

const verifyTx = new Transaction().add(ed25519Ix).add(verifySealIx);
try {
  const sig = await sendAndConfirmTransaction(connection, verifyTx, [wallet]);
  console.log(`\n✅ SEAL VERIFIED with real Ed25519 signature!`);
  console.log(`   tx: ${sig.substring(0, 16)}...`);
  
  // Verify record was created
  const recordInfo = await connection.getAccountInfo(recordPda);
  console.log(`   record account: ${recordInfo.data.length} bytes`);
  console.log(`\n🎉 E2E CRYPTO TEST PASSED - Full dWallet simulation verified!`);
} catch (e) {
  console.error(`\n❌ VERIFY_SEAL FAILED:`, e.message);
  if (e.logs) {
    console.error("Logs:", e.logs.join("\n"));
  }
  process.exit(1);
}
