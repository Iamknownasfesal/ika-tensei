/**
 * E2E test for centralized relayer flow.
 * Tests: create session → pay SOL → confirm payment → get deposit addr → confirm deposit → verify signing starts.
 *
 * Prerequisites:
 *   - Relayer running on localhost:3001
 *   - relayer-keypair.json available (same as relayer)
 *   - NFT already transferred to deposit address (or we skip that for partial test)
 */

import { readFileSync } from 'fs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const API = 'http://localhost:3001';
const SOLANA_RPC = 'https://api.devnet.solana.com';
const RELAYER_WALLET = '4nMLxEsHYGuj1GfFXbn1aowPVbeeqmY3i6BjtMmX4LaU';

// Load user keypair (same as relayer for testing — pays from itself)
const keypairData = JSON.parse(readFileSync('./relayer-keypair.json', 'utf-8'));
const userKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

const conn = new Connection(SOLANA_RPC, 'confirmed');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function main() {
  console.log('=== E2E Test: Centralized Relayer Flow ===\n');

  // 1. Create session
  console.log('Step 1: Creating seal session...');
  const session = await api('POST', '/api/seal/start', {
    solanaWallet: userKeypair.publicKey.toBase58(),
    sourceChain: 'base',
  });
  console.log('  Session:', session.sessionId);
  console.log('  Payment address:', session.paymentAddress);
  console.log('  Fee:', session.feeAmountLamports / LAMPORTS_PER_SOL, 'SOL');

  // 2. Send SOL payment
  console.log('\nStep 2: Sending SOL payment...');
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: new PublicKey(session.paymentAddress),
      lamports: session.feeAmountLamports,
    })
  );
  const txSig = await sendAndConfirmTransaction(conn, tx, [userKeypair]);
  console.log('  Tx signature:', txSig);

  // 3. Confirm payment → creates dWallet → returns deposit address
  console.log('\nStep 3: Confirming payment (creates dWallet — this takes 30-60s)...');
  const paymentResult = await api('POST', '/api/seal/confirm-payment', {
    sessionId: session.sessionId,
    paymentTxSignature: txSig,
  });
  console.log('  Result:', JSON.stringify(paymentResult));

  if (paymentResult.error) {
    console.error('  Payment confirmation failed:', paymentResult.error);
    process.exit(1);
  }

  console.log('  dWallet ID:', paymentResult.dwalletId);
  console.log('  Deposit address:', paymentResult.depositAddress);

  // 4. Check status
  console.log('\nStep 4: Checking session status...');
  const status1 = await api('GET', `/api/seal/${session.sessionId}/status`);
  console.log('  Status:', status1.status);
  console.log('  Deposit address:', status1.depositAddress);
  console.log('  Source chain:', status1.sourceChain);

  if (status1.status !== 'waiting_deposit') {
    console.error('  Expected waiting_deposit, got:', status1.status);
    process.exit(1);
  }

  // 5. Confirm deposit — this will try to verify NFT on Base Sepolia
  // For a real test, we'd transfer an NFT to the deposit address first.
  // Here we test with MiladyTestNFT2 — it will fail verification because the NFT
  // isn't at the deposit address, but it tests the full API flow.
  console.log('\nStep 5: Confirming deposit (will verify on Base Sepolia)...');
  console.log('  Note: This will likely fail verification since no NFT was transferred');
  const depositResult = await api('POST', '/api/seal/confirm-deposit', {
    sessionId: session.sessionId,
    nftContract: '0x993C47d2a7cBf2575076c239d03adcf4480dA141',
    tokenId: '1',
  });
  console.log('  Result:', JSON.stringify(depositResult));

  // 6. Poll status to see the verification result
  console.log('\nStep 6: Polling status...');
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    const status = await api('GET', `/api/seal/${session.sessionId}/status`);
    console.log(`  [${i+1}] Status: ${status.status}${status.error ? ' — Error: ' + status.error : ''}`);
    if (status.status === 'error' || status.status === 'complete' || status.status === 'signing') {
      break;
    }
  }

  console.log('\n=== E2E Test Complete ===');
}

main().catch(err => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
