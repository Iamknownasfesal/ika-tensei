# Ika Tensei - Sui Smart Contracts

![Move](https://img.shields.io/badge/Language-Move-green)
![Tests](https://img.shields.io/badge/Tests-59%2F59-green)
![Version](https://img.shields.io/badge/Version-v3.0.0-blue)

Sui Move smart contracts for the Ika Tensei NFT reincarnation protocol. Implements seal tracking, immutable NFT locking via DWalletCap, and cross-chain metadata resolution.

## Packages

This directory contains two Move packages:

| Package | Description |
|---------|-------------|
| `ikatensei` | Main protocol contract (SealVault, SealRegistry, Admin) |
| `ika_nft` | Demo NFT module for testing seal functionality |

## Architecture

### Module: `ikatensei`

The main protocol module with 5 sub-modules:

#### 1. `seal_vault` - Immutable NFT Lock

Permanently holds DWalletCap IDs. One-way vault with **NO release function**. Once sealed, the corresponding dWallet(s) can NEVER sign again.

```move
public struct SealVault has key, store {
    id: UID,
    sealed_caps: Table<vector<u8>, SealedCap>,
    total_sealed: u64,
}

public struct SealedCap has store {
    dwallet_id: ID,
    cap_id: ID,
}
```

**Key Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `seal` | `seal(vault: &mut SealVault, dwallet_id: ID, cap_id: ID, attestation_dwallet_id: ID, attestation_cap_id: ID, _seal_hash: vector<u8>, _ctx: &mut TxContext)` | Permanently seal DWalletCap IDs (single or dual) |
| `seal_single` | `seal_single(vault: &mut SealVault, dwallet_id: ID, cap_id: ID, seal_hash: vector<u8>, ctx: &mut TxContext)` | Convenience wrapper for Ed25519 chains |
| `is_sealed` | `is_sealed(vault: &SealVault, dwallet_id: ID): bool` | Check if dWallet is permanently sealed |
| `total_sealed` | `total_sealed(vault: &SealVault): u64` | Get total count of sealed dWallets |

#### 2. `registry` - Seal Tracking & Metadata

Main contract tracking all seals, collections, and protocol state. The `init()` function creates:
- `SealRegistry` (shared object)
- `SealVault` (shared object)  
- `AdminCap` (transferred to deployer)

**Key Types:**

```move
public struct SealRegistry has key {
    id: UID,
    config: ProtocolConfig,
    emitters: EmitterRegistry,
    collections: Table<vector<u8>, CollectionConfig>,
    seals: Table<vector<u8>, SealRecord>,
}

public struct SealRecord has store, copy {
    seal_hash: vector<u8>,
    source_chain_id: u16,
    source_contract: vector<u8>,
    token_id: vector<u8>,
    dwallet_id: vector<u8>,
    dwallet_pubkey: vector<u8>,
    attestation_dwallet_id: vector<u8>,
    attestation_pubkey: vector<u8>,
    sealer: address,
    sealed_at: u64,
    reborn: bool,
    solana_mint_address: vector<u8>,
    nonce: u64,
    metadata_name: vector<u8>,
    metadata_description: vector<u8>,
    metadata_uri: vector<u8>,
    walrus_metadata_blob_id: vector<u8>,
    walrus_image_blob_id: vector<u8>,
    collection_name: vector<u8>,
}
```

**Entry Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `register_seal_with_vaa` | `register_seal_with_vaa(registry: &mut SealRegistry, vault: &mut SealVault, vaa_bytes: vector<u8>, dwallet_id: ID, dwallet_cap_id: ID, attestation_dwallet_id: ID, attestation_dwallet_cap_id: ID, dwallet_pubkey: vector<u8>, attestation_pubkey: vector<u8>, source_chain_id: u16, source_contract: vector<u8>, token_id: vector<u8>, nonce: u64, metadata_name: vector<u8>, metadata_description: vector<u8>, metadata_uri: vector<u8>, walrus_metadata_blob_id: vector<u8>, walrus_image_blob_id: vector<u8>, collection_name: vector<u8>, ctx: &mut TxContext): vector<u8>` | Register cross-chain seal via Wormhole VAA |
| `register_seal_native` | `register_seal_native<T: key + store>(registry: &mut SealRegistry, vault: &mut SealVault, nft: T, dwallet_id: ID, dwallet_cap_id: ID, attestation_dwallet_id: ID, attestation_dwallet_cap_id: ID, dwallet_pubkey: vector<u8>, attestation_pubkey: vector<u8>, dwallet_sui_address: address, source_contract: vector<u8>, token_id: vector<u8>, nonce: u64, metadata_name: vector<u8>, metadata_description: vector<u8>, metadata_uri: vector<u8>, walrus_metadata_blob_id: vector<u8>, walrus_image_blob_id: vector<u8>, collection_name: vector<u8>, ctx: &mut TxContext): vector<u8>` | Register Sui-native NFT seal |
| `mark_reborn` | `mark_reborn(registry: &mut SealRegistry, seal_hash: vector<u8>, solana_mint_address: vector<u8>, ctx: &mut TxContext)` | **PERMISSIONLESS** - Mark seal as reborn on Solana |
| `register_collection` | `register_collection(registry: &mut SealRegistry, cap: &AdminCap, collection_id: vector<u8>, source_chain_id: u16, name: vector<u8>, seal_fee: u64, max_seals: u64, ctx: &mut TxContext)` | Register collection (admin) |
| `pause_protocol` | `pause_protocol(registry: &mut SealRegistry, cap: &AdminCap, ctx: &mut TxContext)` | Pause protocol (admin) |
| `unpause_protocol` | `unpause_protocol(registry: &mut SealRegistry, cap: &AdminCap, ctx: &mut TxContext)` | Unpause protocol (admin) |
| `update_treasuries` | `update_treasuries(registry: &mut SealRegistry, cap: &AdminCap, guild_treasury: address, team_treasury: address, ctx: &mut TxContext)` | Update fee recipients (admin) |
| `update_shares` | `update_shares(registry: &mut SealRegistry, cap: &AdminCap, guild_share_bps: u16, team_share_bps: u16, ctx: &mut TxContext)` | Update fee shares (admin) |

**View Functions:**

| Function | Returns | Description |
|----------|---------|-------------|
| `get_seal` | `&SealRecord` | Get seal record by hash |
| `seal_exists` | `bool` | Check if seal exists |
| `is_reborn` | `bool` | Check if seal has been reborn |
| `total_seals` | `u64` | Total seals count |
| `is_paused` | `bool` | Protocol pause state |

#### 3. `admin` - Protocol Configuration

```move
public struct AdminCap has key, store {
    id: UID,
}

public struct ProtocolConfig has copy, drop, store {
    version: u64,
    guild_treasury: address,
    team_treasury: address,
    guild_share_bps: u16,
    team_share_bps: u16,
    paused: bool,
}
```

**Constants:**
- `PROTOCOL_VERSION = 3`
- `DEFAULT_GUILD_SHARE_BPS = 500` (5%)
- `DEFAULT_TEAM_SHARE_BPS = 190` (1.9%)

#### 4. `events` - Event Definitions

All event structs are defined in `registry.move` and include:
- `NFTSealed` - Emitted when NFT is sealed
- `NFTReborn` - Emitted when reborn on Solana
- `CollectionRegistered` / `CollectionDeactivated`
- `EmitterRegisteredEvent` / `EmitterRemovedEvent`
- `ProtocolPauseChanged`

#### 5. `emitters` - Wormhole Emitter Registry

Embedded in SealRegistry, tracks trusted emitters and consumed VAAs for anti-replay:

```move
public struct EmitterRegistry has store {
    trusted_emitters: Table<u16, vector<u8>>,
    consumed_vaas: Table<vector<u8>, bool>,
}
```

**Supported Wormhole Chains:**
- SOL = 1
- ETH = 2
- NEAR = 15
- SUI = 21

### Module: `ika_nft` (Demo)

Simple NFT module for testing seal functionality:

```move
public struct IkaNFT has key, store {
    id: UID,
    name: String,
    description: String,
    image_url: String,
    attributes: String,
    collection: String,
    number: u64,
}

public struct MintCap has key, store {
    id: UID,
}
```

**Functions:**
- `mint()` - Mint new NFT
- `mint_and_transfer()` - Mint and transfer in one call

## Chain IDs

| Chain | ID | Wormhole ID |
|-------|-----|-------------|
| Ethereum | 1 | 2 |
| Sui | 2 | 21 |
| Solana | 3 | 1 |
| Near | 4 | 15 |
| Bitcoin | 5 | N/A |

## Building

```bash
# Build all packages
cd ikatensei && sui move build
cd ../ika_nft && sui move build
```

## Testing

```bash
# Run all tests
cd ikatensei && sui move test
```

**Status:** 59/59 tests passing

## Deployment (Sui Testnet v4)

| Component | Address |
|-----------|---------|
| Package | `0x22a886dfaa15087cbe092b4f7f3135e802c02f8b9fa68d267173de1edc55036e` |
| SealRegistry | `0xffa3bb04b8cdb11c905900da846cc92f70049654b2d9661269c8ba73c3e71294` |
| SealVault | `0x0fccb85175e9f0a0ad99e445bdde187be2a2967d73b0402cb4ca147c5273b9a0` |

Deploy command:
```bash
sui client publish --gas-budget 100000000
```

## Wormhole Integration (Stubbed)

The current `register_seal_with_vaa()` uses a stub for VAA parsing. To enable full Wormhole integration:

1. Add to `Move.toml`:
```toml
Wormhole = { git = "https://github.com/wormhole-foundation/wormhole.git", subdir = "sui/wormhole", rev = "main" }
```

2. Add `wormhole_state: &wormhole::state::WormholeState` and `clock: &sui::clock::Clock` to function signature

3. Replace `parse_vaa_stub()` with real Wormhole verification

## Security Model

- **One-way vault**: No `unseal()` / `release()` / `recover()` function exists
- **DWalletCap transfer**: After sealing, Caps are transferred to SealVault
- **Permissionless reborn**: Anyone can call `mark_reborn()` - no auth required
- **Anti-replay**: VAA hashes tracked in EmitterRegistry

## License

MIT
