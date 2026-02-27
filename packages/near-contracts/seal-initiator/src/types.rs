use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::AccountId;
use near_sdk::NearSchema;

/// A pending seal record created when NFT is locked via nft_transfer_call.
/// Completed when complete_seal_initiation is called.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PendingSeal {
    pub nft_contract: AccountId,
    pub token_id: String,
    pub deposit_address: String,
    pub solana_receiver: [u8; 32],
    pub completed: bool,
    pub wormhole_sequence: u64,
    pub created_at: u64,
}

/// Full seal record stored after Wormhole publish completes.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct SealRecord {
    pub nft_contract: AccountId,
    pub token_id: String,
    pub deposit_address: String,
    pub solana_receiver: [u8; 32],
    pub token_uri: String,
    pub wormhole_sequence: u64,
    pub source_chain_id: u16,
    pub sealed_at: u64,
}

/// JSON payload the user passes in nft_transfer_call's `msg` parameter.
///
/// User calls:
///   nft_contract.nft_transfer_call(
///     receiver_id: "seal-initiator.near",
///     token_id: "123",
///     msg: '{"deposit_address":"alice.near","solana_receiver":"<64 hex chars>"}',
///   )
#[derive(Serialize, Deserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct SealMsg {
    pub deposit_address: String,
    /// 64-char hex-encoded 32-byte Solana pubkey
    pub solana_receiver: String,
}
