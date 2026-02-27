//! Ika Tensei Reborn - NFT Reincarnation Protocol on Solana (PRD v6)
//!
//! A thin program that:
//! - Verifies Ed25519 signatures from IKA dWallet
//! - Creates Metaplex Core collections per source collection
//! - Mints reborn NFTs to receivers
//! - Stores provenance on-chain
//!
//! SECURITY: The shared IKA minting pubkey is stored in a MintConfig PDA
//! (set once at init by admin). mint_reborn loads it from the PDA — never
//! accepts it as instruction input. Heavy verification happens on Sui.
//!
//! ENDIANNESS NOTE: PDA seeds use little-endian encoding for `source_chain`
//! (via `to_le_bytes()`). The Sui wire format sends big-endian, so the relayer
//! must convert before calling this program. This is consistent throughout all
//! Solana-side PDA derivations; off-chain tooling must mirror the same encoding.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use mpl_core::instructions::{CreateV2CpiBuilder, CreateCollectionV2CpiBuilder, UpdateV1CpiBuilder};
use mpl_core::types::{
    DataState, Plugin, PluginAuthority, PluginAuthorityPair,
    Royalties, Creator, RuleSet,
};
use sha2::{Sha256, Digest};

// Program ID - will be overwritten on deployment
declare_id!("2bW2SFSuiBMCef2xNk892uVfSTqjkRGmv6jD9PHKqzW4");

pub mod constants {
    // PDA seeds
    pub const SIG_USED_SEED: &[u8] = b"sig_used";
    pub const PROVENANCE_SEED: &[u8] = b"provenance";
    pub const COLLECTION_REGISTRY_SEED: &[u8] = b"collection_registry";
    pub const COLLECTION_SEED: &[u8] = b"reborn_collection";
    pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
    pub const MINT_CONFIG_SEED: &[u8] = b"mint_config";

    // Max lengths
    /// Max URI length. IPFS URIs are ~80 chars, Arweave ~100 chars;
    /// 512 gives plenty of headroom for future formats.
    pub const MAX_URI_LENGTH: usize = 512;
    pub const MAX_NAME_LENGTH: usize = 32;
    pub const MAX_CONTRACT_LENGTH: usize = 64;
    pub const MAX_TOKEN_ID_LENGTH: usize = 64;
}

// ============ Account Contexts ============

/// Initialize the collection registry
#[derive(Accounts)]
pub struct InitializeCollectionRegistry<'info> {
    #[account(init, payer = payer, space = 8 + CollectionRegistry::INIT_SPACE,
              seeds = [constants::COLLECTION_REGISTRY_SEED], bump)]
    pub registry: Account<'info, CollectionRegistry>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Initialize the mint config — stores the shared IKA minting dWallet pubkey.
/// Called once after deployment. The Solana program loads this pubkey from the
/// Config PDA instead of accepting it as an instruction parameter.
#[derive(Accounts)]
pub struct InitializeMintConfig<'info> {
    #[account(init, payer = admin, space = 8 + MintConfig::INIT_SPACE,
              seeds = [constants::MINT_CONFIG_SEED], bump)]
    pub config: Account<'info, MintConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Update the mint config (admin only). For key rotation.
#[derive(Accounts)]
pub struct UpdateMintConfig<'info> {
    #[account(mut, seeds = [constants::MINT_CONFIG_SEED], bump = config.bump,
              has_one = admin)]
    pub config: Account<'info, MintConfig>,
    pub admin: Signer<'info>,
}

/// Update the URI of a minted Metaplex Core asset (admin only).
/// The mint_authority PDA is the update authority on the asset.
#[derive(Accounts)]
#[instruction(source_chain: u16, nft_contract: Vec<u8>)]
pub struct UpdateAssetUri<'info> {
    #[account(seeds = [constants::MINT_CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, MintConfig>>,
    pub admin: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The Metaplex Core asset to update
    /// CHECK: Validated by MPL Core CPI
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// The collection the asset belongs to
    /// CHECK: Validated by MPL Core CPI
    pub collection_asset: UncheckedAccount<'info>,
    /// Mint authority PDA - update authority on the asset
    /// CHECK: PDA signer
    #[account(seeds = [constants::MINT_AUTHORITY_SEED, &source_chain.to_le_bytes(), &nft_contract], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core program
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

/// Initialize a RebornCollection PDA for a source collection.
/// Must be called once before the first mint_reborn for each (source_chain, nft_contract).
/// Separated from mint_reborn to keep the latter's try_accounts below the BPF 4KB stack limit.
#[derive(Accounts)]
#[instruction(source_chain: u16, nft_contract: Vec<u8>)]
pub struct InitRebornCollection<'info> {
    #[account(init, payer = payer, space = 8 + RebornCollection::INIT_SPACE,
              seeds = [constants::COLLECTION_SEED, &source_chain.to_le_bytes(), &nft_contract], bump)]
    pub collection: Box<Account<'info, RebornCollection>>,
    /// Payer — must be admin to prevent front-running of collection initialization
    #[account(mut, constraint = payer.key() == config.admin @ ErrorCode::Unauthorized)]
    pub payer: Signer<'info>,
    #[account(seeds = [constants::MINT_CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, MintConfig>,
    pub system_program: Program<'info, System>,
}

/// Mint a reborn NFT - main entry point
///
/// REPLAY PROTECTION: Instead of a ring buffer (which overflows after N entries),
/// we use a per-signature PDA (`sig_record`). The PDA is derived from
/// `sha256(signature)`. Anchor's `init` constraint means the transaction fails
/// if the PDA already exists — i.e., if the signature was already used.
#[derive(Accounts)]
#[instruction(
    sig_hash: Vec<u8>,         // sha256(signature) — used as PDA seed for replay protection
    source_chain: u16,         // Source chain ID (little-endian in PDA seeds)
    nft_contract: Vec<u8>,
    token_id: Vec<u8>,
)]
pub struct MintReborn<'info> {
    /// Payer for the transaction — must be the admin (relayer) to prevent front-running
    #[account(mut, constraint = payer.key() == config.admin @ ErrorCode::Unauthorized)]
    pub payer: Signer<'info>,

    /// Receiver of the reborn NFT.
    ///
    /// SECURITY NOTE: We do not restrict this to any particular account type.
    /// Sending to a PDA or program-owned account is allowed but the owner
    /// will need to know how to handle MPL Core assets. The caller (relayer)
    /// is responsible for ensuring this is a sensible destination.
    /// We reject the system program address and the zero key as obviously wrong.
    /// CHECK: validated in instruction body (not system program / zero key)
    pub receiver: UncheckedAccount<'info>,

    /// Per-signature PDA for replay protection.
    /// Seeds: ["sig_used", sig_hash]. `init` fails if already exists → replay blocked.
    /// Space: 8 (discriminator) + 1 (bump byte) = 9 bytes.
    #[account(init, payer = payer, space = 8 + SigUsed::INIT_SPACE,
              seeds = [constants::SIG_USED_SEED, &sig_hash], bump)]
    pub sig_record: Box<Account<'info, SigUsed>>,

    /// Provenance record for this NFT (PDA).
    /// `init` ensures each (source_chain, nft_contract, token_id) can only be minted once.
    ///
    /// NOTE: Seeds use `source_chain.to_le_bytes()` (little-endian). The relayer must
    /// convert the Sui big-endian chain ID to LE before calling.
    #[account(init, payer = payer, space = 8 + Provenance::INIT_SPACE,
              seeds = [constants::PROVENANCE_SEED, &source_chain.to_le_bytes(), &nft_contract, &token_id],
              bump)]
    pub provenance: Box<Account<'info, Provenance>>,

    /// Our metadata PDA tracking per-collection state.
    /// Must be pre-created via `init_reborn_collection` before the first mint.
    /// This uses `mut` instead of `init_if_needed` to stay under the BPF 4KB stack limit.
    #[account(mut, seeds = [constants::COLLECTION_SEED, &source_chain.to_le_bytes(), &nft_contract], bump = collection.bump)]
    pub collection: Box<Account<'info, RebornCollection>>,

    /// Mint authority PDA - signs the Metaplex Core CPIs
    /// CHECK: This is a PDA owned by our program; used only as a signer in CPIs.
    #[account(seeds = [constants::MINT_AUTHORITY_SEED, &source_chain.to_le_bytes(), &nft_contract], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    /// The Metaplex Core collection asset account.
    /// On first mint this is created by `CreateCollectionV2CpiBuilder` (must be a signer/new keypair).
    /// On subsequent mints this is the existing collection asset; we pass it to `CreateV2`
    /// so the new NFT is linked to the collection.
    /// CHECK: Owned by MPL Core after the first mint CPI; validated via CPI.
    #[account(mut)]
    pub collection_asset: UncheckedAccount<'info>,

    /// New Metaplex Core asset (keypair, must be a signer in outer tx)
    /// CHECK: New account created by MPL Core CPI.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Instructions sysvar - needed for Ed25519 verification
    #[account(address = sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// Mint config PDA — stores the shared IKA minting dWallet pubkey.
    /// Loaded on every mint to verify the signature was produced by the correct key.
    #[account(seeds = [constants::MINT_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, MintConfig>>,
}

// NOTE: SealAndMintNative (Solana-native path) is disabled pending anchor-spl 0.30.1 / spl-token 4.x
// compatibility fix for TokenAccount/Mint Discriminator traits. The cross-chain flow (mint_reborn)
// is unaffected. Re-enable by removing the cfg gate and fixing the token type imports.
// See: https://github.com/coral-xyz/anchor/issues/3025

// ============ Account Structs ============

/// Stores the shared IKA minting dWallet's Ed25519 public key.
/// This is the single key that signs ALL seal attestations.
/// Set once at init, updatable only by admin (for key rotation).
/// Seeds: ["mint_config"]. Never accepted as instruction input.
#[account]
#[derive(InitSpace)]
pub struct MintConfig {
    /// Ed25519 public key of the shared IKA minting dWallet (32 bytes)
    pub minting_pubkey: [u8; 32],
    /// Admin who can update the config
    pub admin: Pubkey,
    /// PDA bump
    pub bump: u8,
}

/// Marker account proving a signature was used. Its mere existence blocks replays.
/// Seeds: ["sig_used", sha256(signature)]. Space: 8 + 1 = 9 bytes per signature.
#[account]
#[derive(InitSpace)]
pub struct SigUsed {
    /// Bump stored for completeness (account existence is the actual protection).
    pub bump: u8,
}

/// Registry of source collections that have been created on Solana
#[account]
#[derive(InitSpace)]
pub struct CollectionRegistry {
    /// Number of collections registered
    pub count: u64,
    /// Bump for PDA
    pub bump: u8,
    #[max_len(50)]
    pub collections: Vec<CollectionEntry>,
}

impl CollectionRegistry {
    /// Check if a collection exists
    pub fn find_collection(&self, source_chain: u16, nft_contract: &[u8]) -> Option<&CollectionEntry> {
        self.collections.iter().find(|c| c.source_chain == source_chain && c.nft_contract == nft_contract)
    }

    /// Add a new collection
    pub fn add_collection(&mut self, entry: CollectionEntry) {
        self.collections.push(entry);
        self.count = self.count.saturating_add(1);
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
#[derive(InitSpace)]
pub struct CollectionEntry {
    pub source_chain: u16,
    #[max_len(64)]
    pub nft_contract: Vec<u8>,
    pub collection_address: Pubkey,
    pub created_at: i64,
}

/// Per-collection metadata stored in our program's PDA.
/// NOTE: This is separate from the Metaplex Core collection asset account (`collection_asset`).
/// The MPL Core collection asset is owned by the MPL Core program; this PDA is owned
/// by our program and tracks reborn-specific metadata.
#[account]
#[derive(InitSpace)]
pub struct RebornCollection {
    pub source_chain: u16,
    #[max_len(64)]
    pub nft_contract: Vec<u8>,
    #[max_len(32)]
    pub name: String,
    /// Address of the Metaplex Core collection asset account
    pub collection_asset_address: Pubkey,
    pub total_minted: u64,
    pub is_initialized: bool,
    pub bump: u8,
}

/// Provenance record for a reborn NFT
#[account]
#[derive(InitSpace)]
pub struct Provenance {
    pub source_chain: u16,
    #[max_len(64)]
    pub nft_contract: Vec<u8>,
    #[max_len(64)]
    pub token_id: Vec<u8>,
    /// URI up to 512 bytes (covers IPFS ~80, Arweave ~100, and future formats)
    #[max_len(512)]
    pub token_uri: String,
    pub dwallet_pubkey: [u8; 32],
    pub signature: [u8; 64],
    pub receiver: Pubkey,
    pub sealed_at: i64,
    pub is_initialized: bool,
    pub bump: u8,
}

// ============ Program ============

#[program]
pub mod ika_tensei_reborn {
    use super::*;

    /// Initialize the mint config with the shared IKA minting dWallet pubkey.
    /// Called once after deployment. The pubkey is stored on-chain and loaded
    /// by mint_reborn — never accepted as instruction input.
    pub fn initialize_mint_config(
        ctx: Context<InitializeMintConfig>,
        minting_pubkey: [u8; 32],
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.minting_pubkey = minting_pubkey;
        config.admin = ctx.accounts.admin.key();
        config.bump = ctx.bumps.config;
        msg!("MintConfig initialized with minting pubkey: {}", hex::encode(&minting_pubkey));
        Ok(())
    }

    /// Update the minting pubkey (admin only). For key rotation.
    pub fn update_mint_config(
        ctx: Context<UpdateMintConfig>,
        new_minting_pubkey: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.config.minting_pubkey = new_minting_pubkey;
        msg!("MintConfig updated with new minting pubkey: {}", hex::encode(&new_minting_pubkey));
        Ok(())
    }

    /// Update the URI of a minted Metaplex Core asset (admin only).
    pub fn update_asset_uri(
        ctx: Context<UpdateAssetUri>,
        source_chain: u16,
        nft_contract: Vec<u8>,
        new_uri: String,
    ) -> Result<()> {
        require!(new_uri.len() <= constants::MAX_URI_LENGTH, ErrorCode::UriTooLong);

        let mint_authority_bump = ctx.bumps.mint_authority;
        let mint_authority_seeds: &[&[u8]] = &[
            constants::MINT_AUTHORITY_SEED,
            &source_chain.to_le_bytes(),
            &nft_contract,
            &[mint_authority_bump],
        ];

        UpdateV1CpiBuilder::new(&ctx.accounts.mpl_core_program)
            .asset(&ctx.accounts.asset)
            .collection(Some(&ctx.accounts.collection_asset))
            .authority(Some(&ctx.accounts.mint_authority))
            .payer(&ctx.accounts.payer)
            .system_program(&ctx.accounts.system_program)
            .new_uri(new_uri.clone())
            .invoke_signed(&[mint_authority_seeds])
            .map_err(|_e| ErrorCode::MetaplexError)?;

        msg!("Asset URI updated to: {}", new_uri);
        Ok(())
    }

    /// Initialize the collection registry
    pub fn initialize_collection_registry(ctx: Context<InitializeCollectionRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.count = 0;
        registry.bump = ctx.bumps.registry;
        registry.collections = Vec::new();
        msg!("CollectionRegistry initialized");
        Ok(())
    }

    /// Initialize a RebornCollection PDA. Called once per source collection
    /// before the first mint_reborn.
    pub fn init_reborn_collection(
        ctx: Context<InitRebornCollection>,
        source_chain: u16,
        nft_contract: Vec<u8>,
    ) -> Result<()> {
        let collection = &mut ctx.accounts.collection;
        collection.source_chain = source_chain;
        collection.nft_contract = nft_contract;
        collection.name = String::new();
        collection.collection_asset_address = Pubkey::default();
        collection.total_minted = 0;
        collection.is_initialized = false;
        collection.bump = ctx.bumps.collection;
        msg!("RebornCollection PDA created");
        Ok(())
    }

    /// Mint a reborn NFT after verifying IKA dWallet signature
    ///
    /// Flow:
    /// 1. Validate inputs
    /// 2. Verify sig_hash == sha256(signature) to prevent PDA seed manipulation
    /// 3. Load minting pubkey from Config PDA (never accepted as input)
    /// 4. Reconstruct message: sha256(token_uri || token_id || receiver) (v7 order)
    /// 5. Verify Ed25519 signature (pubkey, message, AND signature bytes) via precompile
    /// 6. sig_record PDA init provides replay protection (Anchor init fails if PDA exists)
    /// 7. Create Metaplex Core collection if first NFT from this source collection
    /// 8. Mint Metaplex Core NFT (linked to collection) to receiver
    /// 9. Store provenance
    pub fn mint_reborn(
        ctx: Context<MintReborn>,
        sig_hash: Vec<u8>,
        source_chain: u16,
        nft_contract: Vec<u8>,
        token_id: Vec<u8>,
        signature: Vec<u8>,
        token_uri: String,
        collection_name: String,
        royalty_basis_points: u16,
        dao_treasury: Pubkey,
    ) -> Result<()> {
        // ============ 1. Input validation ============
        require!(signature.len() == 64, ErrorCode::InvalidSignature);
        require!(sig_hash.len() == 32, ErrorCode::InvalidSigHash);
        require!(!nft_contract.is_empty() && nft_contract.len() <= constants::MAX_CONTRACT_LENGTH, ErrorCode::ContractTooLong);
        require!(!token_id.is_empty() && token_id.len() <= constants::MAX_TOKEN_ID_LENGTH, ErrorCode::TokenIdTooLong);
        require!(!token_uri.is_empty() && token_uri.len() <= constants::MAX_URI_LENGTH, ErrorCode::UriTooLong);
        require!(!collection_name.is_empty() && collection_name.len() <= constants::MAX_NAME_LENGTH, ErrorCode::NameTooLong);
        require!(royalty_basis_points <= 10000, ErrorCode::InvalidRoyalties);

        let receiver_pubkey = ctx.accounts.receiver.key();

        // Reject obviously wrong receiver addresses
        require!(
            receiver_pubkey != System::id() && receiver_pubkey != Pubkey::default(),
            ErrorCode::InvalidReceiver
        );

        // ============ 2-5. Verify sig, compute message hash, check Ed25519 ============
        // Heavy crypto (sha256 + ed25519) is in verify_seal() which has its own
        // stack frame (#[inline(never)]) to stay under the BPF 4KB limit.
        let dwallet_pubkey = ctx.accounts.config.minting_pubkey;
        verify_seal(
            &ctx.accounts.instructions_sysvar,
            &dwallet_pubkey,
            &signature,
            &sig_hash,
            &token_uri,
            &token_id,
            &receiver_pubkey,
        )?;

        msg!("Signature verified against stored minting pubkey");

        // ============ 6. Replay protection (PDA-based) ============
        // The `sig_record` account was created by Anchor's `init` constraint.
        // If it already existed the transaction would have already failed above.
        // We store the bump for completeness.
        let sig_record = &mut ctx.accounts.sig_record;
        sig_record.bump = ctx.bumps.sig_record;
        msg!("Replay protection: sig_record PDA created, replay blocked for this signature");

        // ============ 7. Create collection if first mint ============
        let collection_asset_key = ctx.accounts.collection_asset.key();
        let is_new_collection = !ctx.accounts.collection.is_initialized;

        let mint_authority_bump = ctx.bumps.mint_authority;
        let mint_authority_seeds: &[&[u8]] = &[
            constants::MINT_AUTHORITY_SEED,
            &source_chain.to_le_bytes(),
            &nft_contract,
            &[mint_authority_bump],
        ];

        if is_new_collection {
            let payer_key = ctx.accounts.payer.key();

            // Configure royalties: 6.9% total (690 bps), split 72% DAO (~5%) / 28% team (~1.9%)
            let royalties_plugin = PluginAuthorityPair {
                plugin: Plugin::Royalties(Royalties {
                    basis_points: royalty_basis_points,
                    creators: vec![
                        Creator { address: dao_treasury, percentage: 72 },
                        Creator { address: payer_key, percentage: 28 },
                    ],
                    rule_set: RuleSet::None,
                }),
                authority: Some(PluginAuthority::UpdateAuthority),
            };

            // First NFT from this source collection — create the Metaplex Core collection asset
            CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
                .collection(&ctx.accounts.collection_asset)
                .update_authority(Some(&ctx.accounts.mint_authority))
                .payer(&ctx.accounts.payer)
                .system_program(&ctx.accounts.system_program)
                .name(collection_name.clone())
                .uri(format!(
                    "https://ika-tensei.io/collections/{}/{}",
                    source_chain,
                    hex::encode(&nft_contract)
                ))
                .plugins(vec![royalties_plugin])
                .invoke_signed(&[mint_authority_seeds])
                .map_err(|_e| ErrorCode::MetaplexError)?;

            msg!("Created new Metaplex Core collection: {} (royalties: {}bp)", collection_name, royalty_basis_points);

            // Finalize our RebornCollection metadata PDA (pre-created by init_reborn_collection)
            let collection = &mut ctx.accounts.collection;
            collection.name = collection_name.clone();
            collection.collection_asset_address = collection_asset_key;
            collection.is_initialized = true;

        } else {
            msg!("Using existing collection: {}", ctx.accounts.collection.name);
        }

        // ============ 8. Mint reborn NFT ============
        let collection = &mut ctx.accounts.collection;

        // Build the NFT name: "{CollectionName} #{decimal_token_id}"
        // token_id is a big-endian uint256 (32 bytes), so strip leading zeros and convert to decimal.
        let nft_name = format!("{} #{}", collection.name, token_id_to_decimal(&token_id));

        // CPI to Metaplex Core to mint the NFT, linked to our collection asset
        CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
            .asset(&ctx.accounts.asset)
            .collection(Some(&ctx.accounts.collection_asset))
            .authority(Some(&ctx.accounts.mint_authority))
            .payer(&ctx.accounts.payer)
            .owner(Some(&ctx.accounts.receiver))
            .system_program(&ctx.accounts.system_program)
            .data_state(DataState::AccountState)
            .name(nft_name)
            .uri(token_uri.clone())
            .invoke_signed(&[mint_authority_seeds])
            .map_err(|_e| ErrorCode::MetaplexError)?;

        collection.total_minted = collection.total_minted.saturating_add(1);
        msg!("NFT minted to {}", receiver_pubkey);

        // ============ 9. Store provenance ============
        let provenance = &mut ctx.accounts.provenance;
        provenance.source_chain = source_chain;
        provenance.nft_contract = nft_contract;
        provenance.token_id = token_id;
        provenance.token_uri = token_uri;
        provenance.dwallet_pubkey = dwallet_pubkey;
        provenance.signature = signature.try_into().unwrap(); // length validated above
        provenance.receiver = receiver_pubkey;
        provenance.sealed_at = Clock::get()?.unix_timestamp;
        provenance.is_initialized = true;
        provenance.bump = ctx.bumps.provenance;

        msg!("Provenance stored for {}", receiver_pubkey);

        Ok(())
    }

    // NOTE: seal_and_mint_native disabled pending anchor-spl token type compatibility fix.
    // See comment above SealAndMintNative struct definition.
    // The cross-chain flow (mint_reborn) is unaffected.
    /*
    pub fn seal_and_mint_native(
        ctx: Context<SealAndMintNative>,
        token_uri: String,
        collection_name: String,
    ) -> Result<()> {
        // ============ 1. Input validation ============
        require!(token_uri.len() <= constants::MAX_URI_LENGTH, ErrorCode::UriTooLong);
        require!(collection_name.len() <= constants::MAX_NAME_LENGTH, ErrorCode::NameTooLong);

        let user_key = ctx.accounts.user.key();
        let nft_mint_key = ctx.accounts.nft_mint.key();

        // Derive nft_contract and token_id from the on-chain mint key.
        // For Solana-native NFTs, the mint address IS the contract and the token ID
        // (SPL tokens are 1:1 mint-to-NFT). This is tamper-proof.
        let nft_contract = nft_mint_key.to_bytes().to_vec();
        let token_id = nft_mint_key.to_bytes().to_vec();
        let source_chain: u16 = 1; // Solana = Wormhole chain ID 1

        // ============ 2. Transfer NFT to sealed vault PDA (permanent lock) ============
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.nft_token_account.to_account_info(),
            to: ctx.accounts.sealed_nft_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        anchor_spl::token::transfer(cpi_ctx, 1)?;

        msg!("NFT {} sealed permanently in vault PDA", nft_mint_key);

        // ============ 3. Create collection if first mint ============
        let collection_asset_key = ctx.accounts.collection_asset.key();
        let is_new_collection = !ctx.accounts.collection.is_initialized;

        let mint_authority_bump = ctx.bumps.mint_authority;
        let nft_contract_ref = nft_mint_key.as_ref();
        let source_chain_bytes = source_chain.to_le_bytes();
        let mint_authority_seeds: &[&[u8]] = &[
            constants::MINT_AUTHORITY_SEED,
            &source_chain_bytes,
            nft_contract_ref,
            &[mint_authority_bump],
        ];

        if is_new_collection {
            CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
                .collection(&ctx.accounts.collection_asset)
                .update_authority(Some(&ctx.accounts.mint_authority))
                .payer(&ctx.accounts.user)
                .system_program(&ctx.accounts.system_program)
                .name(collection_name.clone())
                .uri(format!(
                    "https://ika-tensei.io/collections/{}/{}",
                    source_chain,
                    nft_mint_key
                ))
                .invoke_signed(&[mint_authority_seeds])
                .map_err(|_e| ErrorCode::MetaplexError)?;

            let collection = &mut ctx.accounts.collection;
            collection.source_chain = source_chain;
            collection.nft_contract = nft_contract.clone();
            collection.name = collection_name.clone();
            collection.collection_asset_address = collection_asset_key;
            collection.total_minted = 0;
            collection.is_initialized = true;
            collection.bump = ctx.bumps.collection;

            ctx.accounts.registry.add_collection(CollectionEntry {
                source_chain,
                nft_contract: nft_contract.clone(),
                collection_address: collection_asset_key,
                created_at: Clock::get()?.unix_timestamp,
            });
        }

        // ============ 4. Mint reborn NFT ============
        let collection = &mut ctx.accounts.collection;

        let nft_name = format!("{} (Reborn)", collection.name);

        CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
            .asset(&ctx.accounts.asset)
            .collection(Some(&ctx.accounts.collection_asset))
            .authority(Some(&ctx.accounts.mint_authority))
            .payer(&ctx.accounts.user)
            .owner(Some(&ctx.accounts.user))
            .update_authority(Some(&ctx.accounts.mint_authority))
            .system_program(&ctx.accounts.system_program)
            .data_state(DataState::AccountState)
            .name(nft_name)
            .uri(token_uri.clone())
            .invoke_signed(&[mint_authority_seeds])
            .map_err(|_e| ErrorCode::MetaplexError)?;

        collection.total_minted = collection.total_minted.saturating_add(1);
        msg!("Reborn NFT minted to {}", user_key);

        // ============ 5. Store provenance ============
        let provenance = &mut ctx.accounts.provenance;
        provenance.source_chain = source_chain;
        provenance.nft_contract = nft_contract;
        provenance.token_id = token_id;
        provenance.token_uri = token_uri;
        provenance.dwallet_pubkey = [0u8; 32]; // No dWallet for native path
        provenance.signature = [0u8; 64];       // No signature for native path
        provenance.receiver = user_key;
        provenance.sealed_at = Clock::get()?.unix_timestamp;
        provenance.is_initialized = true;
        provenance.bump = ctx.bumps.provenance;

        msg!("Provenance stored for native seal of {}", nft_mint_key);

        Ok(())
    }
    */
}

// ============ Helpers ============

/// Convert a big-endian uint256 byte slice to a decimal string.
/// Strips leading zeros, then converts to u128 if it fits, otherwise falls back to hex.
fn token_id_to_decimal(bytes: &[u8]) -> String {
    let trimmed: &[u8] = match bytes.iter().position(|&b| b != 0) {
        Some(pos) => &bytes[pos..],
        None => return "0".to_string(),
    };
    if trimmed.len() <= 16 {
        let mut val: u128 = 0;
        for &b in trimmed {
            val = (val << 8) | b as u128;
        }
        val.to_string()
    } else {
        // Too large for u128, use 0x-prefixed hex
        format!("0x{}", hex::encode(trimmed))
    }
}

/// Verify the seal: sig_hash matches sha256(signature), message hash is correct,
/// and Ed25519 signature is valid. Separated into its own stack frame to reduce
/// the main mint_reborn function's stack usage below the BPF 4KB limit.
#[inline(never)]
fn verify_seal(
    instructions_sysvar: &AccountInfo,
    minting_pubkey: &[u8; 32],
    signature: &[u8],
    sig_hash: &[u8],
    token_uri: &str,
    token_id: &[u8],
    receiver_pubkey: &Pubkey,
) -> Result<()> {
    // Verify sig_hash == sha256(signature)
    let computed_sig_hash: [u8; 32] = Sha256::digest(signature).into();
    require!(
        constant_time_eq::constant_time_eq(&computed_sig_hash, sig_hash),
        ErrorCode::InvalidSigHash
    );

    // Reconstruct message hash: sha256(token_uri || token_id || receiver)
    let mut hasher = Sha256::new();
    hasher.update(token_uri.as_bytes());
    hasher.update(token_id);
    hasher.update(receiver_pubkey.as_ref());
    let message_hash: [u8; 32] = hasher.finalize().into();

    // Verify Ed25519 signature via precompile
    verify_ed25519_signature(
        instructions_sysvar,
        minting_pubkey,
        &message_hash,
        signature,
    )?;

    Ok(())
}

/// Verify an Ed25519 signature using Solana's native precompile.
///
/// Walks the transaction instruction list looking for a call to the
/// Ed25519 program. Extracts and verifies **three** fields from the
/// instruction data against our expected values:
///
/// 1. Public key (offset from data[6..7])
/// 2. Message    (offset from data[10..11], size from data[12..13])
/// 3. **Signature bytes** (offset from data[2..3]) — previously missing (FIX 1)
///
/// Ed25519 instruction header layout (per signature entry, starting at byte 2):
/// ```
///  [0]     num_signatures
///  [1]     padding
///  [2..3]  sig_offset          (u16 LE) ← FIX 1: now verified
///  [4..5]  sig_instruction_idx (u16 LE)
///  [6..7]  pubkey_offset       (u16 LE)
///  [8..9]  pubkey_instruction_idx (u16 LE)
/// [10..11] message_offset      (u16 LE)
/// [12..13] message_size        (u16 LE)
/// [14..15] message_instruction_idx (u16 LE)
/// ```
fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    expected_pubkey: &[u8],
    expected_message: &[u8],
    expected_signature: &[u8],
) -> Result<()> {
    // The Ed25519 precompile instruction MUST be at index 0 in the transaction.
    // This prevents confusion with Ed25519 instructions from other programs in
    // a composed transaction. The relayer always places it at position 0.
    let ed25519_ix = ix_sysvar::load_instruction_at_checked(0, instructions_sysvar)
        .map_err(|_| ErrorCode::NoEd25519Instruction)?;

    if ed25519_ix.program_id != ed25519_program::ID {
        return Err(ErrorCode::NoEd25519Instruction.into());
    }

    verify_ed25519_ix_data(&ed25519_ix.data, expected_pubkey, expected_message, expected_signature)
}

/// Inner verification of Ed25519 instruction data fields.
/// Checks all three fields: signature bytes, public key, and message.
fn verify_ed25519_ix_data(
    data: &[u8],
    expected_pubkey: &[u8],
    expected_message: &[u8],
    expected_signature: &[u8],
) -> Result<()> {
    // Minimum header size: 2 (count + padding) + 14 (one signature entry header)
    if data.len() < 16 {
        return Err(ErrorCode::InvalidInstructionData.into());
    }

    let num_signatures = data[0];
    if num_signatures < 1 {
        return Err(ErrorCode::InvalidInstructionData.into());
    }

    // Parse offsets from the first signature entry header (starts at byte 2)
    let sig_offset     = u16::from_le_bytes([data[2],  data[3]])  as usize;
    let pubkey_offset  = u16::from_le_bytes([data[6],  data[7]])  as usize;
    let message_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_size   = u16::from_le_bytes([data[12], data[13]]) as usize;

    // Verify signature bytes (all 64)
    match data.get(sig_offset..sig_offset + 64) {
        Some(sig_data) => {
            if !constant_time_eq::constant_time_eq(sig_data, expected_signature) {
                return Err(ErrorCode::SignatureVerificationFailed.into());
            }
        }
        None => return Err(ErrorCode::InvalidInstructionData.into()),
    }

    // Verify public key (32 bytes)
    match data.get(pubkey_offset..pubkey_offset + 32) {
        Some(pubkey_data) => {
            if !constant_time_eq::constant_time_eq(pubkey_data, expected_pubkey) {
                return Err(ErrorCode::SignatureVerificationFailed.into());
            }
        }
        None => return Err(ErrorCode::InvalidInstructionData.into()),
    }

    // Verify message (must be exactly 32 bytes = our SHA256 hash)
    if message_size != 32 {
        return Err(ErrorCode::SignatureVerificationFailed.into());
    }
    match data.get(message_offset..message_offset + message_size) {
        Some(message_data) => {
            if !constant_time_eq::constant_time_eq(message_data, expected_message) {
                return Err(ErrorCode::SignatureVerificationFailed.into());
            }
        }
        None => return Err(ErrorCode::InvalidInstructionData.into()),
    }

    Ok(())
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid Ed25519 signature")]
    InvalidSignature,

    #[msg("Invalid instruction data")]
    InvalidInstructionData,

    #[msg("No Ed25519 instruction found in transaction")]
    NoEd25519Instruction,

    #[msg("Ed25519 signature verification failed (pubkey, message, or signature bytes mismatch)")]
    SignatureVerificationFailed,

    #[msg("Signature already used — replay protection")]
    SignatureAlreadyUsed,

    #[msg("sig_hash does not match sha256(signature)")]
    InvalidSigHash,

    #[msg("Collection already exists")]
    CollectionAlreadyExists,

    #[msg("NFT already minted")]
    AlreadyMinted,

    #[msg("Contract address too long")]
    ContractTooLong,

    #[msg("Token ID too long")]
    TokenIdTooLong,

    #[msg("URI too long (max 512 bytes)")]
    UriTooLong,

    #[msg("Name too long")]
    NameTooLong,

    #[msg("Receiver must not be the system program or zero key")]
    InvalidReceiver,

    #[msg("Metaplex error")]
    MetaplexError,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Source chain must be Solana (chain ID 1) for native seal")]
    InvalidSourceChain,

    #[msg("NFT token account mint does not match provided nft_mint")]
    InvalidNftMint,

    #[msg("NFT token account must contain exactly 1 token")]
    InvalidNftAmount,

    #[msg("Invalid royalty basis points (max 10000)")]
    InvalidRoyalties,
}
