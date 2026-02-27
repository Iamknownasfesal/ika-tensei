use near_sdk::ext_contract;
use near_sdk::json_types::U128;

/// External interface for Wormhole core contract on NEAR.
#[allow(dead_code)]
#[ext_contract(ext_wormhole)]
pub trait WormholeCore {
    /// Publish a message to Wormhole guardians.
    /// `data`: hex-encoded payload bytes
    /// `nonce`: arbitrary u32 nonce
    /// Returns: sequence number (u64)
    fn publish_message(&self, data: String, nonce: u32) -> u64;

    /// Get the current message fee in yoctoNEAR.
    fn message_fee(&self) -> U128;
}

/// External interface for NEP-171 NFT contracts.
#[allow(dead_code)]
#[ext_contract(ext_nft)]
pub trait NftContract {
    /// Returns the token data including metadata (NEP-171 + NEP-177).
    fn nft_token(&self, token_id: String) -> Option<near_contract_standards::non_fungible_token::Token>;
}
