# Aptos SealInitiator

Ika Tensei SealInitiator for Aptos. Verifies Digital Asset (Token v2) ownership at a deposit address and emits a Wormhole-compatible seal payload for cross-chain processing on Sui.

## Architecture

Single-step flow (simpler than NEAR since Aptos Move is synchronous):

1. User deposits NFT to the dWallet deposit address on Aptos
2. Anyone calls `initiate_seal` — verifies ownership, reads URI, builds payload, emits events

The contract emits `WormholeMessagePublished` and `SealInitiated` events. When deployed with real Wormhole integration, the `WormholeMessagePublished` event is replaced by an actual `wormhole::publish_message` call.

## Wire Format

Matches the canonical Ika Tensei wire format:

```
Offset  Size  Field            Encoding
0       1     payload_type     u8 = 0x01
1       2     source_chain     u16 BE = 22 (Aptos)
3       32    nft_contract     creator address (native 32 bytes)
35      32    token_id         token object address (native 32 bytes)
67      32    deposit_address  deposit address (native 32 bytes)
99      32    receiver         raw Solana pubkey
131     var   token_uri        raw UTF-8, no length prefix
```

Aptos addresses are natively 32 bytes — no hashing or padding needed (unlike EVM/NEAR).

## Usage

```bash
# Compile
aptos move compile --named-addresses ika_tensei_aptos=<deployer_address>

# Test
aptos move test --named-addresses ika_tensei_aptos=0x1

# Deploy
aptos move publish --named-addresses ika_tensei_aptos=<deployer_address>
```

## Deployment

1. Deploy the contract
2. Call `initialize()` (runs automatically or must be called once)
3. Register the emitter address on the Sui orchestrator

## User Flow

```typescript
// User calls initiate_seal after depositing NFT to dWallet address
const payload = {
  function: `${PACKAGE_ID}::seal_initiator::initiate_seal`,
  arguments: [
    contractAddress,      // address where SealState lives
    tokenObjectAddress,   // Object<Token>
    depositAddress,       // address
    solanaReceiverBytes,  // vector<u8>, 32 bytes
  ],
};
```
