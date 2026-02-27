# NEAR SealInitiator

Ika Tensei SealInitiator for NEAR Protocol. Locks NEP-171 NFTs and publishes Wormhole VAAs for cross-chain seal processing on Sui.

## Architecture

Two-step flow due to NEAR's async cross-contract call model:

1. **Lock NFT** — User calls `nft_transfer_call` on the NFT contract, targeting this contract. `nft_on_transfer` records a pending seal and permanently locks the NFT.

2. **Complete Seal** — Anyone calls `complete_seal_initiation`. This queries NFT metadata via cross-contract call, builds the binary payload, and publishes a Wormhole message.

## Wire Format

Matches the canonical Ika Tensei wire format (same as EVM SealInitiator):

```
Offset  Size  Field            Encoding
0       1     payload_type     u8 = 0x01
1       2     source_chain     u16 BE = 15 (NEAR)
3       32    nft_contract     SHA256(nft_contract_account_id)
35      32    token_id         SHA256(token_id_string)
67      32    deposit_address  SHA256(deposit_account_id)
99      32    receiver         raw Solana pubkey
131     var   token_uri        raw UTF-8, no length prefix
```

NEAR uses SHA256 for address/ID encoding since NEAR account IDs and token IDs are variable-length strings (unlike EVM's fixed 20-byte addresses).

## Usage

```bash
# Build
cargo check --target wasm32-unknown-unknown

# Test
cargo test

# Build WASM (requires cargo-near)
cargo near build
```

## Deployment

1. Deploy the contract
2. Call `new(wormhole_account)` to initialize
3. Call `register_as_emitter()` to register with Wormhole
4. Register the emitter address on the Sui orchestrator

## User Flow

```js
// 1. User sends NFT to SealInitiator via nft_transfer_call
nftContract.nft_transfer_call({
  receiver_id: "seal-initiator.near",
  token_id: "42",
  msg: JSON.stringify({
    deposit_address: "deposit-dwallet.near",
    solana_receiver: "...64 hex chars..."
  })
});

// 2. Complete the seal (anyone can call)
sealInitiator.complete_seal_initiation({
  nft_contract: "nft.paras.near",
  token_id: "42"
}, { attachedDeposit: wormholeFee });
```
