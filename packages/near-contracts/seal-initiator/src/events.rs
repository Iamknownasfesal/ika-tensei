use near_sdk::log;
use near_sdk::serde::Serialize;

/// NEP-297 standard event prefix
const EVENT_STANDARD: &str = "ika_tensei";
const EVENT_VERSION: &str = "1.0.0";

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct SealInitiatedData {
    nft_contract: String,
    token_id: String,
    deposit_address: String,
    token_uri: String,
    solana_receiver: String,
    wormhole_sequence: u64,
    source_chain_id: u16,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct TokenUriUnavailableData {
    nft_contract: String,
    token_id: String,
}

/// Emit SealInitiated event (NEP-297 format).
pub fn emit_seal_initiated(
    nft_contract: &str,
    token_id: &str,
    deposit_address: &str,
    token_uri: &str,
    solana_receiver: &[u8; 32],
    wormhole_sequence: u64,
) {
    let data = SealInitiatedData {
        nft_contract: nft_contract.to_string(),
        token_id: token_id.to_string(),
        deposit_address: deposit_address.to_string(),
        token_uri: token_uri.to_string(),
        solana_receiver: hex::encode(solana_receiver),
        wormhole_sequence,
        source_chain_id: 15,
    };

    let event = serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": "seal_initiated",
        "data": [data],
    });

    log!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap());
}

/// Emit when token URI was not available from the NFT contract.
pub fn emit_token_uri_unavailable(nft_contract: &str, token_id: &str) {
    let data = TokenUriUnavailableData {
        nft_contract: nft_contract.to_string(),
        token_id: token_id.to_string(),
    };

    let event = serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": "token_uri_unavailable",
        "data": [data],
    });

    log!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap());
}
