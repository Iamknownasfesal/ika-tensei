# Ika Tensei - Solana Program

![Rust](https://img.shields.io/badge/Language-Rust-orange)
![Anchor](https://img.shields.io/badge/Framework-Anchor%200.30.1-blue)
![Tests](https://img.shields.io/badge/Tests-7%2F7-green)
![Program ID](https://img.shields.io/badge/Program%20ID-mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa-blue)

Solana on-chain program for minting Reborn NFTs via Metaplex Core CPI. Handles seal verification, fee collection, and royalty distribution.

## Overview

The Solana program verifies Ed25519 signatures from IKA dWallets and mints Metaplex Core assets as "reborn" NFTs. It uses program-derived addresses (PDAs) for mint authority and implements a fee structure for guild and team treasuries.

## Program ID

```
mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa
```

## PDA Seeds

| Account | Seeds | Description |
|---------|-------|-------------|
| Config | `["ika_config"]` | Protocol configuration |
| Collection | `["collection", chain_u16_le, contract]` | Per-chain collection configs |
| Record | `["reincarnation", seal_hash]` | Reincarnation records |
| MintAuth | `["reincarnation_mint", seal_hash]` | Mint authority for each seal |

## Account Structures

### ProtocolConfig

```rust
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub guild_treasury: Pubkey,
    pub team_treasury: Pubkey,
    pub guild_share_bps: u16,
    pub mint_fee: u64,
    pub paused: bool,
    pub bump: u8,
}
```

### CollectionConfig

```rust
#[account]
#[derive(InitSpace)]
pub struct CollectionConfig {
    pub source_chain: u16,
    pub source_contract: Vec<u8>,
    pub name: String,
    pub max_supply: u64,
    pub total_minted: u64,
    pub active: bool,
    pub bump: u8,
}
```

### ReincarnationRecord

```rust
#[account]
#[derive(InitSpace)]
pub struct ReincarnationRecord {
    pub seal_hash: [u8; 32],
    pub source_chain: u16,
    pub source_contract: Vec<u8>,
    pub token_id: Vec<u8>,
    pub attestation_pubkey: [u8; 32],
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub minted: bool,
    pub verified_at: i64,
    pub bump: u8,
}
```

## Instructions

### 1. `initialize`

Initialize the protocol configuration.

```rust
pub fn initialize(
    ctx: Context<Initialize>,
    guild_treasury: Pubkey,
    team_treasury: Pubkey,
    guild_share_bps: u16,
    mint_fee: u64,
) -> Result<()>
```

**Accounts:**
- `config` - Initialized ProtocolConfig (PDA)
- `authority` - Payer and initial authority
- `system_program` - System program

**Parameters:**
- `guild_treasury` - Guild receiving address
- `team_treasury` - Team receiving address
- `guild_share_bps` - Guild share in basis points (default: 500 = 5%)
- `mint_fee` - Fee in lamports (default: 1,000,000 = 0.001 SOL)

### 2. `register_collection`

Register a collection for reborn NFTs.

```rust
pub fn register_collection(
    ctx: Context<RegisterCollection>,
    source_chain: u16,
    source_contract: Vec<u8>,
    name: String,
    max_supply: u64,
) -> Result<()>
```

**Accounts:**
- `config` - ProtocolConfig (validated)
- `collection` - New CollectionConfig (PDA)
- `authority` - Must be config authority
- `system_program` - System program

**Parameters:**
- `source_chain` - Source chain ID (1=ETH, 2=SUI, 3=SOL, 4=NEAR)
- `source_contract` - Source contract address
- `name` - Collection name (max 32 chars)
- `max_supply` - Max mints (0 = unlimited)

### 3. `verify_seal`

Verify a seal and create a reincarnation record. **Requires Ed25519 signature verification.**

```rust
pub fn verify_seal(
    ctx: Context<VerifySeal>,
    seal_hash: [u8; 32],
    source_chain: u16,
    source_contract: Vec<u8>,
    token_id: Vec<u8>,
    attestation_pubkey: Pubkey,
    recipient: Pubkey,
) -> Result<()>
```

**Accounts:**
- `config` - ProtocolConfig (checked for pause state)
- `collection` - CollectionConfig (validated)
- `record` - New ReincarnationRecord (PDA)
- `payer` - Payer for account creation
- `recipient` - Intended NFT owner (verified in record)
- `instructions_sysvar` - For Ed25519 signature verification
- `system_program` - System program

**Ed25519 Verification Flow:**

The program uses the Ed25519 precompile to verify signatures directly:

```rust
fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    expected_message: &[u8; 32],
) -> Result<()> {
    // Load current instruction index
    let current_ix = ix_sysvar::load_current_index_checked(instructions_sysvar)?;
    
    // Load the Ed25519 instruction (must be preceding instruction)
    let ed25519_ix = ix_sysvar::load_instruction_at_checked(
        (current_ix - 1) as usize,
        instructions_sysvar,
    )?;
    
    // Verify it's the Ed25519 program
    require!(
        ed25519_ix.program_id == ed25519_program::ID,
        ErrorCode::InvalidSignature
    );
    
    // Extract and verify pubkey and message from instruction data
    // ... (see lib.rs for full implementation)
}
```

**Fee Distribution:**

```
MINT_FEE = 1,000,000 lamports (0.001 SOL)
GUILD_SHARE_BPS = 500 (5%)
TEAM_SHARE_BPS = 190 (1.9%)
Total Royalty = 690 bps (6.9%)
```

### 4. `mint_reborn`

Mint a Reborn NFT via Metaplex Core CPI.

```rust
pub fn mint_reborn(
    ctx: Context<MintReborn>,
    seal_hash: [u8; 32],
    name: String,
    uri: String,
) -> Result<()>
```

**Accounts:**
- `config` - ProtocolConfig
- `record` - ReincarnationRecord (must not be minted)
- `mint_authority` - PDA signing as update authority
- `asset` - New Metaplex Core asset (signer in outer tx)
- `recipient` - Verified against record.recipient
- `payer` - Payer for mint
- `mpl_core_program` - Metaplex Core program
- `system_program` - System program

**Plugins Applied:**
1. **Royalties**: 690 bps (500 guild + 190 team)
2. **ImmutableMetadata**: Locks name/uri permanently

### 5. `create_onchain_collection`

Create a Metaplex Core Collection PDA.

```rust
pub fn create_onchain_collection(
    ctx: Context<CreateOnchainCollection>,
    name: String,
    uri: String,
) -> Result<()>
```

### 6. `pause` / `unpause`

Emergency pause/unpause functionality.

### 7. `update_config`

Update protocol configuration.

```rust
pub fn update_config(
    ctx: Context<AdminOnly>,
    guild_treasury: Option<Pubkey>,
    team_treasury: Option<Pubkey>,
    guild_share_bps: Option<u16>,
    mint_fee: Option<u64>,
) -> Result<()>
```

### 8. `transfer_authority`

Transfer admin authority to new address.

## Building

```bash
# Build the program (use cargo build-sbf, NOT anchor build)
cd ika_tensei
cargo build-sbf
```

**Note:** `anchor build` is broken with Rust 1.93. Use `cargo build-sbf` instead.

## Testing

```bash
# Run tests
cd ika_tensei
cargo test
```

**Status:** 7/7 tests passing

## Deployment

```bash
# Deploy to devnet
solana program deploy target/deploy/ika_tensei.so --url devnet

# Or mainnet
solana program deploy target/deploy/ika_tensei.so --url mainnet-beta
```

## Upgrade Authority

The program uses Anchor's default upgrade authority (the deployer keypair). This is suitable for development and testing, but mainnet requires a secure multi-signature setup.

### Current Setup (Development)
- **Authority:** Deployer keypair (`~/.config/solana/id.json`)
- **Suitable for:** Devnet, testnet

### Mainnet Plan

**Phase 1 - Deploy (Deployer Keypair)**
- Program deployed with deployer as upgrade authority
- Suitable for iterative updates during audit period

**Phase 2 - Transfer to Multisig (Post-Audit)**
- Transfer upgrade authority to a secure multisig (e.g., 3-of-5)
- Enables team-based upgrade decisions with hardware wallet security

**Phase 3 - Revoke (After Stability Period)**
- Make program immutable by revoking upgrade authority
- Ensures no future upgrades can occur
- Requires `--final` flag

### Commands

**Transfer to Multisig:**
```bash
solana program set-upgrade-authority mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa \
  --new-upgrade-authority <MULTISIG_ADDRESS> \
  --url mainnet-beta
```

**Make Immutable (Revoke):**
```bash
solana program set-upgrade-authority mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa \
  --final \
  --url mainnet-beta
```

**Verify Current Authority:**
```bash
solana program show mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa
```

### Security Notes
- Never deploy to mainnet with deployer keypair as upgrade authority long-term
- Use a hardware wallet for multisig signers
- Wait 30+ days of stability before revoking
- Document the multisig threshold and signers in operational runbooks

## Metaplex Core CPI

The program uses Metaplex Core's `CreateV2CpiBuilder` for minting:

```rust
CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
    .asset(&ctx.accounts.asset)
    .authority(Some(&ctx.accounts.mint_authority))
    .payer(&ctx.accounts.payer)
    .owner(Some(&ctx.accounts.recipient))
    .update_authority(Some(&ctx.accounts.mint_authority))
    .system_program(&ctx.accounts.system_program)
    .data_state(DataState::AccountState)
    .name(name)
    .uri(uri)
    .plugins(plugins)
    .invoke_signed(&[mint_authority_seeds])
```

## Error Codes

| Code | Message |
|------|---------|
| `Paused` | Protocol is paused |
| `InvalidSignature` | Invalid ed25519 signature |
| `AlreadyVerified` | Seal already verified |
| `CollectionNotRegistered` | Collection not registered |
| `CollectionNotActive` | Collection not active |
| `SupplyExhausted` | Collection supply exhausted |
| `AlreadyMinted` | Already minted |
| `InvalidBps` | Invalid bps value |
| `NameTooLong` | Name too long |
| `UriTooLong` | URI too long |
| `TokenIdTooLong` | Token ID too long |
| `ContractAddressTooLong` | Contract address too long |

## Fee Structure

| Fee Component | Value |
|---------------|-------|
| MINT_FEE | 1,000,000 lamports (0.001 SOL) |
| GUILD_SHARE_BPS | 500 (5%) |
| TEAM_SHARE_BPS | 190 (1.9%) |
| Total Royalty on NFT | 690 bps (6.9%) |

Guild receives ~72% of royalty, Team receives ~28%.

## Dependencies

```toml
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
mpl-core = { version = "0.7", features = ["anchor"] }
solana-program = "1.18.22"
```

## License

MIT
