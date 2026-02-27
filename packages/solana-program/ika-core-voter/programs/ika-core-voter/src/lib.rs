use anchor_lang::prelude::*;
use std::collections::BTreeSet;

declare_id!("E5thJCWofTMbmyhUhCai3hZiruFtYmmscDio6GwFCGaW");

/// Metaplex Core program ID (used to verify asset account ownership).
/// CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
const MPL_CORE_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0xaf, 0x54, 0xab, 0x10, 0xbd, 0x97, 0xa5, 0x42,
    0xa0, 0x9e, 0xf7, 0xb3, 0x98, 0x89, 0xdd, 0x0c,
    0xd3, 0x94, 0xa4, 0xcc, 0xe9, 0xdf, 0xa6, 0xcd,
    0xc9, 0x7e, 0xbe, 0x2d, 0x23, 0x5b, 0xa7, 0x48,
]);

/// Maximum number of collections a single registrar can track.
const MAX_COLLECTIONS: usize = 10;

// ─── Accounts ────────────────────────────────────────────────────────────────

/// Per-realm registrar that tracks which Metaplex Core collections are eligible to vote.
#[account]
pub struct Registrar {
    /// The SPL Governance program this registrar is associated with.
    pub governance_program_id: Pubkey,
    /// The realm this registrar belongs to.
    pub realm: Pubkey,
    /// The community governance token mint (used as PDA seed).
    pub governing_token_mint: Pubkey,
    /// Configured collections (collection address → vote weight).
    pub collections: Vec<CollectionConfig>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CollectionConfig {
    /// Metaplex Core collection address.
    pub collection: Pubkey,
    /// Vote weight per NFT from this collection.
    pub weight: u64,
}

impl Registrar {
    /// Space: discriminator(8) + 3 pubkeys(96) + vec prefix(4) + MAX_COLLECTIONS * (32+8)
    pub const SPACE: usize = 8 + 96 + 4 + MAX_COLLECTIONS * 40;
}

/// SPL Governance voter weight record. The struct name MUST be `VoterWeightRecord`
/// so Anchor generates the discriminator `SHA256("account:VoterWeightRecord")[..8]`
/// which SPL Governance v3 expects.
#[account]
pub struct VoterWeightRecord {
    pub realm: Pubkey,
    pub governing_token_mint: Pubkey,
    pub governing_token_owner: Pubkey,
    pub voter_weight: u64,
    pub voter_weight_expiry: Option<u64>,
    pub weight_action: Option<VoterWeightAction>,
    pub weight_action_target: Option<Pubkey>,
    pub reserved: [u8; 8],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum VoterWeightAction {
    CastVote,
    CommentProposal,
    CreateGovernance,
    CreateProposal,
    SignOffProposal,
}

impl VoterWeightRecord {
    /// Space: discriminator(8) + 3 pubkeys(96) + u64(8) + option<u64>(9)
    ///        + option<enum>(2) + option<pubkey>(33) + reserved(8)
    pub const SPACE: usize = 8 + 96 + 8 + 9 + 2 + 33 + 8;
}

/// Max voter weight record for the realm.
#[account]
pub struct MaxVoterWeightRecord {
    pub realm: Pubkey,
    pub governing_token_mint: Pubkey,
    pub max_voter_weight: u64,
    pub max_voter_weight_expiry: Option<u64>,
    pub reserved: [u8; 8],
}

impl MaxVoterWeightRecord {
    /// Space: discriminator(8) + 2 pubkeys(64) + u64(8) + option<u64>(9) + reserved(8)
    pub const SPACE: usize = 8 + 64 + 8 + 9 + 8;
}

// ─── Instructions ────────────────────────────────────────────────────────────

#[program]
pub mod ika_core_voter {
    use super::*;

    /// Create a registrar for a realm. Only the realm authority can call this.
    pub fn create_registrar(ctx: Context<CreateRegistrar>) -> Result<()> {
        let registrar = &mut ctx.accounts.registrar;
        registrar.governance_program_id = ctx.accounts.governance_program_id.key();
        registrar.realm = ctx.accounts.realm.key();
        registrar.governing_token_mint = ctx.accounts.governing_token_mint.key();
        registrar.collections = Vec::new();
        Ok(())
    }

    /// Add or update a Metaplex Core collection in the registrar.
    pub fn configure_collection(
        ctx: Context<ConfigureCollection>,
        collection: Pubkey,
        weight: u64,
    ) -> Result<()> {
        let registrar = &mut ctx.accounts.registrar;

        // Update existing or add new
        if let Some(existing) = registrar.collections.iter_mut().find(|c| c.collection == collection) {
            existing.weight = weight;
        } else {
            require!(
                registrar.collections.len() < MAX_COLLECTIONS,
                CoreVoterError::MaxCollectionsReached
            );
            registrar.collections.push(CollectionConfig { collection, weight });
        }

        Ok(())
    }

    /// Create a voter weight record for a voter. Anyone can create their own.
    pub fn create_voter_weight_record(ctx: Context<CreateVoterWeightRecord>) -> Result<()> {
        let record = &mut ctx.accounts.voter_weight_record;
        record.realm = ctx.accounts.realm.key();
        record.governing_token_mint = ctx.accounts.governing_token_mint.key();
        record.governing_token_owner = ctx.accounts.governing_token_owner.key();
        record.voter_weight = 0;
        record.voter_weight_expiry = None;
        record.weight_action = None;
        record.weight_action_target = None;
        record.reserved = [0u8; 8];
        Ok(())
    }

    /// Update voter weight by counting owned Metaplex Core NFTs.
    ///
    /// The voter passes their Core asset accounts as `remaining_accounts`.
    /// Each asset is verified for: correct program owner, AssetV1 key, voter ownership,
    /// and membership in a registered collection. Duplicate assets are rejected.
    pub fn update_voter_weight_record(ctx: Context<UpdateVoterWeightRecord>) -> Result<()> {
        let registrar = &ctx.accounts.registrar;
        let record = &mut ctx.accounts.voter_weight_record;
        let voter = ctx.accounts.governing_token_owner.key();

        let mut total_weight: u64 = 0;
        let mut seen_assets: BTreeSet<Pubkey> = BTreeSet::new();

        for asset_info in ctx.remaining_accounts.iter() {
            // Reject duplicate asset accounts
            require!(
                seen_assets.insert(asset_info.key()),
                CoreVoterError::DuplicateAsset
            );

            let (collection, verified) = verify_core_nft_ownership(asset_info, &voter)?;

            if !verified {
                continue;
            }

            // Look up the collection weight in the registrar
            if let Some(config) = registrar.collections.iter().find(|c| c.collection == collection) {
                total_weight = total_weight
                    .checked_add(config.weight)
                    .ok_or(CoreVoterError::ArithmeticOverflow)?;
            }
            // If the collection isn't registered, we just skip it (no error)
        }

        record.voter_weight = total_weight;
        // Expire after this slot to force re-verification on each vote
        record.voter_weight_expiry = Some(Clock::get()?.slot);
        record.weight_action = None;
        record.weight_action_target = None;

        Ok(())
    }

    /// Create or update the max voter weight record.
    /// For Core collections there's no fixed supply cap, so we set a large value.
    pub fn create_max_voter_weight_record(
        ctx: Context<CreateMaxVoterWeightRecord>,
        max_voter_weight: u64,
    ) -> Result<()> {
        let record = &mut ctx.accounts.max_voter_weight_record;
        record.realm = ctx.accounts.realm.key();
        record.governing_token_mint = ctx.accounts.governing_token_mint.key();
        record.max_voter_weight = max_voter_weight;
        record.max_voter_weight_expiry = None; // never expires
        record.reserved = [0u8; 8];
        Ok(())
    }
}

// ─── Core Asset Verification ─────────────────────────────────────────────────

/// Verify a Metaplex Core asset is owned by the voter and belongs to a collection.
///
/// Parses raw account bytes at fixed offsets (only 66 bytes needed):
///   Byte 0:      Key enum (must be 1 = AssetV1)
///   Bytes 1-32:  owner (must match voter)
///   Byte 33:     UpdateAuthority discriminant (must be 2 = Collection)
///   Bytes 34-65: UpdateAuthority pubkey (the collection address)
///
/// Returns (collection_pubkey, true) on success, or (Pubkey::default(), false) on failure.
fn verify_core_nft_ownership(
    asset_info: &AccountInfo,
    voter: &Pubkey,
) -> Result<(Pubkey, bool)> {
    // Must be owned by the Metaplex Core program
    if asset_info.owner != &MPL_CORE_PROGRAM_ID {
        return Ok((Pubkey::default(), false));
    }

    let data = asset_info.try_borrow_data()?;

    // Need at least 66 bytes for the fields we parse
    if data.len() < 66 {
        return Ok((Pubkey::default(), false));
    }

    // Key must be AssetV1 (1)
    if data[0] != 1 {
        return Ok((Pubkey::default(), false));
    }

    // Owner must match voter (bytes 1..33)
    if &data[1..33] != voter.as_ref() {
        return Ok((Pubkey::default(), false));
    }

    // UpdateAuthority discriminant must be Collection (2)
    if data[33] != 2 {
        return Ok((Pubkey::default(), false));
    }

    // Extract collection pubkey (bytes 34..66)
    let collection = Pubkey::try_from(&data[34..66]).map_err(|_| CoreVoterError::InvalidAssetData)?;

    Ok((collection, true))
}

// ─── Instruction Contexts ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CreateRegistrar<'info> {
    #[account(
        init,
        payer = payer,
        space = Registrar::SPACE,
        seeds = [b"registrar", realm.key().as_ref(), governing_token_mint.key().as_ref()],
        bump,
    )]
    pub registrar: Account<'info, Registrar>,

    /// CHECK: The SPL Governance program ID. Must be an executable program.
    #[account(constraint = governance_program_id.executable @ CoreVoterError::InvalidGovernanceProgram)]
    pub governance_program_id: UncheckedAccount<'info>,

    /// CHECK: The realm account. Must be owned by the governance program.
    #[account(
        constraint = realm.owner == governance_program_id.key @ CoreVoterError::InvalidRealmOwner
    )]
    pub realm: UncheckedAccount<'info>,

    /// CHECK: The community governance token mint.
    pub governing_token_mint: UncheckedAccount<'info>,

    /// The realm authority (must be signer).
    pub realm_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfigureCollection<'info> {
    #[account(
        mut,
        seeds = [b"registrar", registrar.realm.as_ref(), registrar.governing_token_mint.as_ref()],
        bump,
    )]
    pub registrar: Account<'info, Registrar>,

    /// CHECK: The realm account. Must be owned by the stored governance program and match the registrar's realm.
    #[account(
        constraint = realm.key() == registrar.realm @ CoreVoterError::InvalidRealmOwner,
        constraint = realm.owner == &registrar.governance_program_id @ CoreVoterError::InvalidRealmOwner,
    )]
    pub realm: UncheckedAccount<'info>,

    /// The realm authority (must be signer).
    pub realm_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateVoterWeightRecord<'info> {
    #[account(
        init,
        payer = payer,
        space = VoterWeightRecord::SPACE,
        seeds = [
            b"voter-weight-record",
            realm.key().as_ref(),
            governing_token_mint.key().as_ref(),
            governing_token_owner.key().as_ref(),
        ],
        bump,
    )]
    pub voter_weight_record: Account<'info, VoterWeightRecord>,

    /// CHECK: The realm account.
    pub realm: UncheckedAccount<'info>,

    /// CHECK: The community governance token mint.
    pub governing_token_mint: UncheckedAccount<'info>,

    /// CHECK: The voter (governing token owner).
    pub governing_token_owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVoterWeightRecord<'info> {
    #[account(
        seeds = [b"registrar", registrar.realm.as_ref(), registrar.governing_token_mint.as_ref()],
        bump,
    )]
    pub registrar: Account<'info, Registrar>,

    #[account(
        mut,
        seeds = [
            b"voter-weight-record",
            registrar.realm.as_ref(),
            registrar.governing_token_mint.as_ref(),
            governing_token_owner.key().as_ref(),
        ],
        bump,
        constraint = voter_weight_record.realm == registrar.realm,
        constraint = voter_weight_record.governing_token_mint == registrar.governing_token_mint,
    )]
    pub voter_weight_record: Account<'info, VoterWeightRecord>,

    /// CHECK: The voter. Must be signer to prove they own the NFTs.
    pub governing_token_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateMaxVoterWeightRecord<'info> {
    /// The registrar must exist for this realm (ensures realm is properly set up).
    #[account(
        seeds = [b"registrar", realm.key().as_ref(), governing_token_mint.key().as_ref()],
        bump,
    )]
    pub registrar: Account<'info, Registrar>,

    #[account(
        init,
        payer = payer,
        space = MaxVoterWeightRecord::SPACE,
        seeds = [b"max-voter-weight-record", realm.key().as_ref(), governing_token_mint.key().as_ref()],
        bump,
    )]
    pub max_voter_weight_record: Account<'info, MaxVoterWeightRecord>,

    /// CHECK: The realm account. Must be owned by the governance program stored in the registrar.
    #[account(
        constraint = realm.owner == &registrar.governance_program_id @ CoreVoterError::InvalidRealmOwner
    )]
    pub realm: UncheckedAccount<'info>,

    /// CHECK: The community governance token mint.
    pub governing_token_mint: UncheckedAccount<'info>,

    /// The realm authority (must be signer).
    pub realm_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum CoreVoterError {
    #[msg("Maximum number of collections reached")]
    MaxCollectionsReached,
    #[msg("Invalid asset data")]
    InvalidAssetData,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Duplicate asset account passed in remaining_accounts")]
    DuplicateAsset,
    #[msg("Realm account is not owned by the governance program")]
    InvalidRealmOwner,
    #[msg("Governance program ID is not a valid executable program")]
    InvalidGovernanceProgram,
}
