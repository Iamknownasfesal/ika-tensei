/**
 * Test: Verify multi-gateway IPFS image resolution + Arweave upload.
 * Creates session → pays SOL → dWallet → mints Sui NFT with IPFS image → confirm deposit.
 */

import { readFileSync } from 'fs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const API = 'http://localhost:3001';
const SOLANA_RPC = 'https://api.devnet.solana.com';

// Sui test NFT package (with Display)
const SUI_NFT_PACKAGE = '0xcd180a8955b474ba270644e6837863745082977a4f5cb60bd68b670bfa9b468d';

// Working IPFS image (Bored Ape #1 image)
const IPFS_IMAGE = 'ipfs://QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi';

const keypairData = JSON.parse(readFileSync('./relayer-keypair.json', 'utf-8'));
const userKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
const conn = new Connection(SOLANA_RPC, 'confirmed');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function main() {
  console.log('=== IPFS Multi-Gateway Image Test ===\n');

  // 1. Create session
  console.log('Step 1: Creating session...');
  const session = await api('POST', '/api/seal/start', {
    solanaWallet: userKeypair.publicKey.toBase58(),
    sourceChain: 'sui',
  });
  console.log('  Session:', session.sessionId);
  console.log('  Fee:', session.feeAmountLamports / LAMPORTS_PER_SOL, 'SOL');

  // 2. Pay SOL
  console.log('\nStep 2: Sending SOL payment...');
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: new PublicKey(session.paymentAddress),
      lamports: session.feeAmountLamports,
    })
  );
  const txSig = await sendAndConfirmTransaction(conn, tx, [userKeypair]);
  console.log('  Tx:', txSig);

  // 3. Confirm payment → creates dWallet (takes 30-60s)
  console.log('\nStep 3: Confirming payment (dWallet creation ~30-60s)...');
  const payResult = await api('POST', '/api/seal/confirm-payment', {
    sessionId: session.sessionId,
    paymentTxSignature: txSig,
  });

  if (payResult.error) {
    console.error('  Payment failed:', payResult.error);
    process.exit(1);
  }
  console.log('  dWallet:', payResult.dwalletId);
  console.log('  Deposit address:', payResult.depositAddress);

  // 4. Mint Sui NFT with IPFS image to deposit address
  console.log('\nStep 4: Mint Sui NFT with IPFS image to deposit address...');
  console.log('  Image URL:', IPFS_IMAGE);
  console.log('  Run this sui CLI command:');
  console.log(`  sui client call --package ${SUI_NFT_PACKAGE} --module nft --function mint_and_transfer --args "IPFS Test Ape" "Testing multi-gateway IPFS image resolution" "${IPFS_IMAGE}" "IPFS Test" ${payResult.depositAddress} --gas-budget 10000000`);
  console.log('\n  Waiting 15s for you to run the command (or it was already run)...');

  // Auto-mint using sui CLI
  const { execSync } = await import('child_process');
  let nftObjectId;
  try {
    const mintResult = execSync(
      `sui client call --package ${SUI_NFT_PACKAGE} --module nft --function mint_and_transfer --args "IPFS Test Ape" "Testing multi-gateway IPFS image resolution" "${IPFS_IMAGE}" "IPFS Test" ${payResult.depositAddress} --gas-budget 10000000 --json`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    const mintJson = JSON.parse(mintResult);
    const created = mintJson.objectChanges?.find(c => c.type === 'created' && c.objectType?.includes('TestNFT'));
    if (created) {
      nftObjectId = created.objectId;
      console.log('  Minted NFT:', nftObjectId);
    }
    console.log('  Mint tx:', mintJson.digest);
  } catch (err) {
    console.error('  Auto-mint failed:', err.message);
    process.exit(1);
  }

  if (!nftObjectId) {
    console.error('  Could not find minted NFT object ID');
    process.exit(1);
  }

  await sleep(5000);

  // 5. Confirm deposit
  console.log('\nStep 5: Confirming deposit...');
  const depositResult = await api('POST', '/api/seal/confirm-deposit', {
    sessionId: session.sessionId,
    nftContract: SUI_NFT_PACKAGE,
    tokenId: nftObjectId,
  });
  console.log('  Result:', JSON.stringify(depositResult, null, 2));

  // 6. Poll status
  console.log('\nStep 6: Polling status (waiting for signing + mint)...');
  for (let i = 0; i < 40; i++) {
    await sleep(5000);
    const st = await api('GET', `/api/seal/${session.sessionId}/status`);
    console.log(`  [${i+1}] ${st.status}${st.error ? ' — ' + st.error : ''}${st.rebornNFT?.mint ? ' — MINT: ' + st.rebornNFT.mint : ''}`);
    if (st.status === 'complete' || st.status === 'error') {
      if (st.rebornNFT) {
        console.log('\n  === REBORN NFT ===');
        console.log('  Mint:', st.rebornNFT.mint);
        console.log('  Name:', st.rebornNFT.name);
        console.log('  Image:', st.rebornNFT.image);
      }
      break;
    }
  }

  console.log('\n=== Test Complete ===');
}

main().catch(err => { console.error(err); process.exit(1); });
