# Ika Tensei - Sui Contracts

Sui Move contracts for Ika Tensei, a cross-chain NFT bridge that "seals" NFTs on source chains and "reborns" them on Solana. Verification happens on Sui using Wormhole VAAs and IKA dWallet 2PC-MPC signing.

## Architecture

```
Source Chain (EVM/Solana)              Sui (IKA Network)                Solana
┌──────────────────────┐    ┌──────────────────────────────────┐    ┌────────────────┐
│  SealInitiator       │    │  orchestrator                    │    │  ika-tensei    │
│  - lock NFT          │───>│  - process_vaa (Wormhole verify) │    │  - mint_reborn │
│  - emit Wormhole VAA │    │  - request_sign_seal (IKA sign)  │───>│                │
└──────────────────────┘    │  - complete_seal (Ed25519 verify)│    └────────────────┘
                            │                                  │
                            │  signing                         │
                            │  - owns minting dWallet (DKG)    │
                            │  - request_sign / request_presign│
                            │                                  │
                            │  dwallet_registry                │
                            │  - deposit address → dWallet map │
                            │                                  │
                            │  treasury                        │
                            │  - IKA/SUI pool for coordinator  │
                            └──────────────────────────────────┘
```

## Modules

### `orchestrator.move` — Main Entry Point

The central contract. All external calls go through here.

**Shared objects created at init:**
- `OrchestratorState` — pending seals, emitter registry, treasury, replay protection
- `MintingAuthority` — stores the Ed25519 public key of the minting dWallet
- `OrchestratorAdminCap` — transferred to deployer

**Seal flow (3 phases):**

1. **`process_vaa`** — Relayer submits a Wormhole VAA from the source chain.
   - Parses and verifies VAA via `wormhole::vaa::parse_and_verify` (guardian signatures)
   - Validates emitter address against registered SealInitiator contracts
   - Checks deposit dWallet is registered and unused (one dWallet = one NFT)
   - Constructs signing message: `sha256(token_uri || token_id || receiver)`
   - Stores `PendingSeal`, emits `SealPending`

2. **`request_sign_seal`** — Relayer triggers IKA 2PC-MPC signing.
   - Looks up the pending seal's message hash
   - Withdraws IKA/SUI from treasury, calls `signing::request_sign`, returns unused coins
   - Relayer polls IKA off-chain for signature completion

3. **`complete_seal`** — Relayer submits the completed Ed25519 signature.
   - Verifies signature against `MintingAuthority` public key on-chain
   - Marks deposit dWallet as permanently used
   - Emits `SealSigned` (relayer watches this to submit `mint_reborn` on Solana)

**Admin functions:**
- `register_emitter` / `remove_emitter` — manage trusted source chain contracts
- `set_minting_pubkey` — set the minting dWallet's Ed25519 public key
- `create_minting_dwallet` — one-time DKG to create the contract's signing dWallet
- `add_ika_payment` / `add_sui_payment` — top up the on-chain treasury
- `request_presign` — pre-generate signing presign caps for the pool

### `signing.move` — Contract-Owned Minting dWallet

Manages the contract's own dedicated dWallet for signing seal attestations. This is separate from the per-NFT deposit dWallets (which only receive NFTs).

**Shared objects:** `SigningState` — holds `Option<DWalletCap>` permanently

The minting dWallet is created via `create_minting_dwallet()` which calls `dwallet_factory` with treasury funding. The `DWalletCap` goes directly into `SigningState` and never leaves contract control.

**Signing:** `verify_presign_cap` → `approve_message` → `request_sign_and_return_id`

**Presigning:** `request_global_presign` → `UnverifiedPresignCap` transferred to relayer

**Crypto params:** Ed25519 curve (3), EdDSA algorithm (4), SHA512 hash (3)

### `dwallet_factory.move` — dWallet Creation via IKA DKG

Thin wrapper around the IKA coordinator's distributed key generation.

Creates "shared" dWallets where the user's secret key share is stored publicly on-chain, allowing the IKA network to sign without the user's active participation.

Two variants:
- `create_shared_dwallet` — caller provides IKA/SUI payment coins (for deposit dWallets)
- `create_shared_dwallet_with_treasury` — treasury-funded (for the minting dWallet)

### `dwallet_registry.move` — Deposit dWallet Registry

Stores deposit dWallets — both metadata records and the actual `DWalletCap` objects. The relayer creates a new IKA dWallet for each seal request and registers it here, transferring the `DWalletCap` into the registry. The contract controls all deposit dWallet caps, not the relayer's wallet.

**Shared objects:** `DWalletRegistry`, `RegistryOwnerCap`

**Storage:**
- `wallets: Table<vector<u8>, DWalletRecord>` — metadata (pubkey, owner, active/used flags)
- `dwallet_caps: Table<vector<u8>, DWalletCap>` — actual dWallet capabilities (keyed by deposit address)

**Lifecycle:** registered (active, cap stored) → used (permanent, cap stays in registry)

`mark_dwallet_used()` is `public(package)` — only callable by `orchestrator` after seal completion.

### `treasury.move` — IKA/SUI Payment Pool

Embedded balance pool (stored inside `OrchestratorState`, not a standalone shared object). Every IKA coordinator call (DKG, presign, sign) requires IKA and SUI payments.

Pattern: `withdraw_coins()` → pass to coordinator → `return_coins()` (unused portion returns to pool).

### `payload.move` — Wormhole VAA Payload Codec

Stateless library for encoding/decoding the seal payload from Wormhole VAAs.

Wire format (matches EVM `abi.encodePacked`):
```
[0]       payload_type: u8 = 1
[1-2]     source_chain: u16 (big-endian)
[3-34]    nft_contract: 32 bytes
[35-66]   token_id: 32 bytes
[67-98]   deposit_address: 32 bytes
[99-130]  receiver: 32 bytes
[131+]    token_uri: variable length (may be empty)
```

Supported chains: Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche, BSC, Sui, Solana, NEAR, Aptos.

## Dependencies

```toml
[dependencies]
ika_dwallet_2pc_mpc = { git = "https://github.com/dwallet-labs/ika.git", subdir = "deployed_contracts/testnet/ika_dwallet_2pc_mpc", rev = "main" }
ika = { git = "https://github.com/dwallet-labs/ika.git", subdir = "deployed_contracts/testnet/ika", rev = "main" }
Wormhole = { git = "https://github.com/wormhole-foundation/wormhole.git", subdir = "sui/wormhole", rev = "main" }
```

## Build

```bash
sui move build
```

## Deployment Setup

After deploying the package:

1. **Register emitters** — `register_emitter(chain_id, emitter_address)` for each source chain's SealInitiator contract
2. **Fund treasury** — `add_ika_payment` + `add_sui_payment` with enough for coordinator fees
3. **Create minting dWallet** — `create_minting_dwallet(...)` with DKG inputs from `@ika.xyz/sdk prepareDKGAsync()`
4. **Set minting pubkey** — `set_minting_pubkey(pubkey)` with the Ed25519 public key extracted from the active dWallet
5. **Seed presign pool** — call `request_presign(...)` multiple times to pre-generate signing caps
6. **Register deposit dWallets** — the relayer creates and registers dWallets as seal requests come in
