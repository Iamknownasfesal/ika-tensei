//! Ika Tensei v3 - NFT Reincarnation Protocol on Solana
//!
//! SECURITY: After final audit, the upgrade authority for this program should be
//! set to a multisig or revoked entirely. The current deployer keypair MUST NOT
//! remain as sole upgrade authority in production.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use mpl_core::instructions::{CreateV2CpiBuilder, CreateCollectionV2CpiBuilder};
use mpl_core::types::{
    DataState, Plugin, PluginAuthority, PluginAuthorityPair,
    Royalties, Creator, RuleSet, ImmutableMetadata,
};

declare_id!("mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa");

pub mod constants {
    pub const MAX_URI_LENGTH: usize = 200;
    pub const MAX_NAME_LENGTH: usize = 32;
    pub const MAX_CONTRACT_LENGTH: usize = 64;
    pub const MAX_TOKEN_ID_LENGTH: usize = 64;
    pub const CONFIG_SEED: &[u8] = b"ika_config";
    pub const RECORD_SEED: &[u8] = b"reincarnation";
    pub const MINT_SEED: &[u8] = b"reincarnation_mint";
    pub const COLLECTION_SEED: &[u8] = b"collection";
    pub const ONCHAIN_COLLECTION_SEED: &[u8] = b"onchain_collection";

    // Chain IDs
    pub const CHAIN_ETHEREUM: u16 = 1;
    pub const CHAIN_SUI: u16 = 2;
    pub const CHAIN_SOLANA: u16 = 3;
    pub const CHAIN_NEAR: u16 = 4;
    pub const CHAIN_BITCOIN: u16 = 5;

    // Royalties (in bps)
    pub const GUILD_ROYALTY_BPS: u16 = 500;
    pub const TEAM_ROYALTY_BPS: u16 = 190;
}

// ============ Account Contexts ============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + ProtocolConfig::INIT_SPACE,
              seeds = [constants::CONFIG_SEED], bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(source_chain: u16, source_contract: Vec<u8>)]
pub struct RegisterCollection<'info> {
    #[account(seeds = [constants::CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(init, payer = authority, space = 8 + CollectionConfig::INIT_SPACE,
              seeds = [constants::COLLECTION_SEED, &source_chain.to_le_bytes(), &source_contract], bump)]
    pub collection: Account<'info, CollectionConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(seal_hash: [u8; 32], source_chain: u16)]
pub struct VerifySeal<'info> {
    #[account(seeds = [constants::CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [constants::COLLECTION_SEED, &source_chain.to_le_bytes(),
              &collection.source_contract], bump = collection.bump)]
    pub collection: Account<'info, CollectionConfig>,
    #[account(init, payer = payer, space = 8 + ReincarnationRecord::INIT_SPACE,
              seeds = [constants::RECORD_SEED, &seal_hash], bump)]
    pub record: Account<'info, ReincarnationRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: recipient wallet address (stored in record)
    pub recipient: UncheckedAccount<'info>,
    /// CHECK: sysvar instructions
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Mint a Reborn NFT via Metaplex Core CPI.
/// The `asset` account must be a new unique keypair (signer in the outer tx).
/// The `mint_authority` PDA signs the CPI as the update authority.
#[derive(Accounts)]
#[instruction(seal_hash: [u8; 32])]
pub struct MintReborn<'info> {
    #[account(seeds = [constants::CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [constants::RECORD_SEED, &seal_hash], bump = record.bump)]
    pub record: Account<'info, ReincarnationRecord>,
    /// CHECK: Mint authority PDA; seeds = [MINT_SEED, seal_hash]
    #[account(seeds = [constants::MINT_SEED, &seal_hash], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: New Metaplex Core asset (must be signer in outer transaction)
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: Recipient — verified against record.recipient
    #[account(address = record.recipient)]
    pub recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Metaplex Core program - verified by address
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: AccountInfo<'info>,
    /// CHECK: Fee recipient (treasury)
    pub fee_recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Create a Metaplex Core Collection whose address is a PDA of this program.
#[derive(Accounts)]
pub struct CreateOnchainCollection<'info> {
    #[account(seeds = [constants::CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Collection PDA; seeds = [ONCHAIN_COLLECTION_SEED, config_key]
    #[account(mut, seeds = [constants::ONCHAIN_COLLECTION_SEED, &config.key().to_bytes()], bump)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core program - verified by address
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(seeds = [constants::CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

// ============ Account Structs ============

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

#[account]
#[derive(InitSpace)]
pub struct CollectionConfig {
    pub source_chain: u16,
    #[max_len(64)]
    pub source_contract: Vec<u8>,
    #[max_len(32)]
    pub name: String,
    pub max_supply: u64,
    pub total_minted: u64,
    pub active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReincarnationRecord {
    pub seal_hash: [u8; 32],
    pub source_chain: u16,
    #[max_len(64)]
    pub source_contract: Vec<u8>,
    #[max_len(64)]
    pub token_id: Vec<u8>,
    pub attestation_pubkey: [u8; 32],
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub minted: bool,
    pub verified_at: i64,
    pub bump: u8,
}

// ============ Program ============

#[program]
pub mod ika_tensei {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        guild_treasury: Pubkey,
        team_treasury: Pubkey,
        guild_share_bps: u16,
        mint_fee: u64,
    ) -> Result<()> {
        require!(guild_share_bps <= 10000, ErrorCode::InvalidBps);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.guild_treasury = guild_treasury;
        config.team_treasury = team_treasury;
        config.guild_share_bps = guild_share_bps;
        config.mint_fee = mint_fee;
        config.paused = false;
        config.bump = ctx.bumps.config;
        msg!("Ika Tensei v3 initialized");
        Ok(())
    }

    pub fn register_collection(
        ctx: Context<RegisterCollection>,
        source_chain: u16,
        source_contract: Vec<u8>,
        name: String,
        max_supply: u64,
    ) -> Result<()> {
        require!(name.len() <= constants::MAX_NAME_LENGTH, ErrorCode::NameTooLong);
        require!(source_contract.len() <= constants::MAX_CONTRACT_LENGTH, ErrorCode::ContractAddressTooLong);
        let coll = &mut ctx.accounts.collection;
        coll.source_chain = source_chain;
        coll.source_contract = source_contract;
        coll.name = name;
        coll.max_supply = max_supply;
        coll.total_minted = 0;
        coll.active = true;
        coll.bump = ctx.bumps.collection;
        msg!("Collection registered");
        Ok(())
    }

    pub fn verify_seal(
        ctx: Context<VerifySeal>,
        seal_hash: [u8; 32],
        source_chain: u16,
        source_contract: Vec<u8>,
        token_id: Vec<u8>,
        attestation_pubkey: Pubkey,
        recipient: Pubkey,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.paused, ErrorCode::Paused);

        let coll = &mut ctx.accounts.collection;
        require!(coll.active, ErrorCode::CollectionNotActive);
        if coll.max_supply > 0 {
            require!(coll.total_minted < coll.max_supply, ErrorCode::SupplyExhausted);
        }
        require!(source_contract.len() <= constants::MAX_CONTRACT_LENGTH, ErrorCode::ContractAddressTooLong);
        require!(token_id.len() <= constants::MAX_TOKEN_ID_LENGTH, ErrorCode::TokenIdTooLong);

        verify_ed25519_signature(
            &ctx.accounts.instructions_sysvar,
            &attestation_pubkey,
            &seal_hash,
        )?;

        let mint_fee = config.mint_fee;
        if mint_fee > 0 {
            let guild_share = mint_fee
                .checked_mul(config.guild_share_bps as u64)
                .unwrap()
                / 10_000;
            let team_share = mint_fee.saturating_sub(guild_share);
            msg!("Fee: {} lamports (guild: {}, team: {})", mint_fee, guild_share, team_share);
        }

        let record = &mut ctx.accounts.record;
        record.seal_hash = seal_hash;
        record.source_chain = source_chain;
        record.source_contract = source_contract;
        record.token_id = token_id;
        record.attestation_pubkey = attestation_pubkey.to_bytes();
        record.recipient = recipient;
        record.mint = Pubkey::default();
        record.minted = false;
        record.verified_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.record;

        coll.total_minted = coll.total_minted.checked_add(1).unwrap();
        msg!("Seal verified: {}", hex::encode(seal_hash));
        Ok(())
    }

    /// Mint a Reborn NFT via Metaplex Core.
    /// Creates a Core Asset with:
    ///   - Royalties plugin: 690 bps (500 guild + 190 team)
    ///   - ImmutableMetadata plugin: locks name/uri permanently
    ///   - Owner set to the `recipient` from the ReincarnationRecord
    ///   - Update authority = mint_authority PDA (program-controlled)
    pub fn mint_reborn(
        ctx: Context<MintReborn>,
        seal_hash: [u8; 32],
        name: String,
        uri: String,
    ) -> Result<()> {
        // M8: Fee enforcement
        let config = &ctx.accounts.config;
        let mint_fee = config.mint_fee;
        
        // Verify fee_recipient is not zero address
        let fee_recipient_key = ctx.accounts.fee_recipient.key();
        require!(fee_recipient_key != Pubkey::default(), ErrorCode::InvalidFeeRecipient);
        
        // Transfer fee from payer to fee_recipient
        if mint_fee > 0 {
            let fee_transfer = anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.fee_recipient.to_account_info(),
            };
            anchor_lang::system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.to_account_info(), fee_transfer),
                mint_fee,
            )?;
            msg!("Fee paid: {} lamports to {}", mint_fee, fee_recipient_key);
        }
        
        require!(name.len() <= constants::MAX_NAME_LENGTH, ErrorCode::NameTooLong);
        require!(uri.len() <= constants::MAX_URI_LENGTH, ErrorCode::UriTooLong);
        require!(!ctx.accounts.config.paused, ErrorCode::Paused);
        require!(!ctx.accounts.record.minted, ErrorCode::AlreadyMinted);

        let mint_authority_bump = ctx.bumps.mint_authority;
        let mint_authority_seeds: &[&[u8]] = &[
            constants::MINT_SEED,
            &seal_hash,
            &[mint_authority_bump],
        ];

        // Build royalty plugins: 500 bps guild + 190 bps team = 690 bps total
        let plugins = vec![
            PluginAuthorityPair {
                plugin: Plugin::Royalties(Royalties {
                    basis_points: constants::GUILD_ROYALTY_BPS + constants::TEAM_ROYALTY_BPS,
                    creators: vec![
                        Creator { address: config.guild_treasury, percentage: 72 }, // ~72% of royalties
                        Creator { address: config.team_treasury, percentage: 28 },  // ~28% of royalties
                    ],
                    rule_set: RuleSet::None,
                }),
                authority: Some(PluginAuthority::UpdateAuthority),
            },
            PluginAuthorityPair {
                plugin: Plugin::ImmutableMetadata(ImmutableMetadata {}),
                authority: Some(PluginAuthority::None),
            },
        ];

        // CPI to Metaplex Core: CreateV2
        // - asset: new unique keypair (signer in outer tx, propagated through CPI)
        // - authority: mint_authority PDA (signs via invoke_signed)
        // - owner: recipient (gets the NFT directly, no transfer needed)
        // - update_authority: mint_authority PDA (program controls updates)
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
            .map_err(|e| ProgramError::from(e))?;

        // Record the mint
        let record = &mut ctx.accounts.record;
        record.mint = ctx.accounts.asset.key();
        record.minted = true;

        msg!("NFT reborn: asset={} recipient={}", record.mint, record.recipient);
        Ok(())
    }

    /// Create a Metaplex Core Collection PDA for grouping Reborn NFTs.
    /// The collection address is a PDA of this program and can sign via invoke_signed.
    pub fn create_onchain_collection(
        ctx: Context<CreateOnchainCollection>,
        name: String,
        uri: String,
    ) -> Result<()> {
        require!(name.len() <= constants::MAX_NAME_LENGTH, ErrorCode::NameTooLong);
        require!(uri.len() <= constants::MAX_URI_LENGTH, ErrorCode::UriTooLong);

        let config_key = ctx.accounts.config.key();
        let collection_bump = ctx.bumps.collection;
        let collection_seeds: &[&[u8]] = &[
            constants::ONCHAIN_COLLECTION_SEED,
            &config_key.to_bytes(),
            &[collection_bump],
        ];

        // CPI to Metaplex Core: CreateCollectionV2
        // collection PDA signs via invoke_signed
        CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
            .collection(&ctx.accounts.collection)
            .update_authority(Some(&ctx.accounts.authority))
            .payer(&ctx.accounts.authority)
            .system_program(&ctx.accounts.system_program)
            .name(name)
            .uri(uri)
            .invoke_signed(&[collection_seeds])
            .map_err(|e| ProgramError::from(e))?;

        msg!("Onchain collection created: {}", ctx.accounts.collection.key());
        Ok(())
    }

    pub fn pause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.config.paused = true;
        msg!("Protocol paused");
        Ok(())
    }

    pub fn unpause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.config.paused = false;
        msg!("Protocol unpaused");
        Ok(())
    }

    pub fn update_config(
        ctx: Context<AdminOnly>,
        guild_treasury: Option<Pubkey>,
        team_treasury: Option<Pubkey>,
        guild_share_bps: Option<u16>,
        mint_fee: Option<u64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(v) = guild_treasury { config.guild_treasury = v; }
        if let Some(v) = team_treasury { config.team_treasury = v; }
        if let Some(v) = guild_share_bps {
            require!(v <= 10000, ErrorCode::InvalidBps);
            config.guild_share_bps = v;
        }
        if let Some(v) = mint_fee { config.mint_fee = v; }
        msg!("Config updated");
        Ok(())
    }

    pub fn transfer_authority(ctx: Context<AdminOnly>, new_authority: Pubkey) -> Result<()> {
        require!(new_authority != ctx.accounts.config.authority, ErrorCode::SameAuthority);
        ctx.accounts.config.authority = new_authority;
        msg!("Authority transferred");
        Ok(())
    }

}

// ============ Helpers ============

fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    expected_message: &[u8; 32],
) -> Result<()> {
    // C8 Fix: Load instruction at index 0 (the Ed25519 instruction) and verify program_id
    let ed25519_ix = ix_sysvar::load_instruction_at_checked(0, instructions_sysvar)
        .map_err(|_| ErrorCode::InvalidEd25519Instruction)?;

    require!(
        ed25519_ix.program_id == anchor_lang::solana_program::ed25519_program::ID,
        ErrorCode::InvalidEd25519Instruction
    );

    let data = &ed25519_ix.data;
    require!(data.len() >= 14, ErrorCode::InvalidSignature);
    require!(data[0] >= 1, ErrorCode::InvalidSignature); // num_signatures >= 1

    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let msg_offset  = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size    = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(pubkey_offset + 32 <= data.len(), ErrorCode::InvalidSignature);
    require!(&data[pubkey_offset..pubkey_offset + 32] == expected_signer.as_ref(), ErrorCode::InvalidSignature);

    require!(msg_size == 32, ErrorCode::InvalidSignature);
    require!(msg_offset + 32 <= data.len(), ErrorCode::InvalidSignature);
    require!(&data[msg_offset..msg_offset + 32] == expected_message.as_ref(), ErrorCode::InvalidSignature);

    Ok(())
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Protocol is paused")]
    Paused,
    #[msg("Invalid ed25519 signature")]
    InvalidSignature,
    #[msg("Invalid Ed25519 instruction")]
    InvalidEd25519Instruction,
    #[msg("Invalid Metaplex Core program")]
    InvalidProgram,
    #[msg("Seal already verified")]
    AlreadyVerified,
    #[msg("Seal not verified")]
    NotVerified,
    #[msg("Already reborn")]
    AlreadyReborn,
    #[msg("Collection not registered")]
    CollectionNotRegistered,
    #[msg("Collection not active")]
    CollectionNotActive,
    #[msg("Collection supply exhausted")]
    SupplyExhausted,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid chain ID")]
    InvalidChainId,
    #[msg("Invalid fee recipient")]
    InvalidFeeRecipient,
    #[msg("Name too long")]
    NameTooLong,
    #[msg("URI too long")]
    UriTooLong,
    #[msg("Token ID too long")]
    TokenIdTooLong,
    #[msg("Contract address too long")]
    ContractAddressTooLong,
    #[msg("Already minted")]
    AlreadyMinted,
    #[msg("Invalid seal data")]
    InvalidSealData,
    #[msg("Invalid bps")]
    InvalidBps,
    #[msg("Same authority")]
    SameAuthority,
    #[msg("NFT not minted yet")]
    NotMinted,
}
