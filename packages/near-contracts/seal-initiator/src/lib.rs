mod events;
mod payload;
mod types;
mod wormhole;

use near_contract_standards::non_fungible_token::core::NonFungibleTokenReceiver;
use near_contract_standards::non_fungible_token::Token;
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LookupMap, LookupSet};
use near_sdk::{
    env, log, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue, PromiseResult,
};
use sha2::{Digest, Sha256};

use events::{emit_seal_initiated, emit_token_uri_unavailable};
use payload::build_seal_payload;
use types::{PendingSeal, SealMsg, SealRecord};
use wormhole::{ext_nft, ext_wormhole};

// Gas allocations for cross-contract calls
const GAS_NFT_TOKEN: Gas = Gas::from_tgas(10);
const GAS_CALLBACK_METADATA: Gas = Gas::from_tgas(70);
const GAS_WORMHOLE_PUBLISH: Gas = Gas::from_tgas(50);
const GAS_CALLBACK_WORMHOLE: Gas = Gas::from_tgas(10);

/// Maximum token URI length (matches EVM constant)
const MAX_URI_LENGTH: usize = 2048;

/// Minimum storage deposit for nft_on_transfer (covers LookupMap/LookupSet inserts)
const STORAGE_DEPOSIT_MIN: NearToken = NearToken::from_millinear(10); // 0.01 NEAR

/// Minimum time before emergency unlock is allowed (24 hours in nanoseconds)
const EMERGENCY_UNLOCK_DELAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    SealedNfts,
    PendingSeals,
    SealRecords,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SealInitiator {
    /// Wormhole core contract account ID
    wormhole_account: AccountId,
    /// Monotonically increasing nonce for Wormhole messages
    sequence: u64,
    /// Replay protection: SHA256(nft_contract || token_id) -> bool
    sealed_nfts: LookupSet<Vec<u8>>,
    /// Pending seals (NFT locked, Wormhole not yet published)
    pending_seals: LookupMap<Vec<u8>, PendingSeal>,
    /// Completed seal records
    seal_records: LookupMap<Vec<u8>, SealRecord>,
    /// Admin who can update settings
    owner: AccountId,
    /// Whether the contract is paused
    paused: bool,
}

#[near]
impl SealInitiator {
    /// Deploy-time initialization.
    #[init]
    pub fn new(wormhole_account: AccountId) -> Self {
        require!(
            env::is_valid_account_id(wormhole_account.as_bytes()),
            "Invalid Wormhole account"
        );
        Self {
            wormhole_account,
            sequence: 0,
            sealed_nfts: LookupSet::new(StorageKey::SealedNfts),
            pending_seals: LookupMap::new(StorageKey::PendingSeals),
            seal_records: LookupMap::new(StorageKey::SealRecords),
            owner: env::predecessor_account_id(),
            paused: false,
        }
    }

    // ── Core Flow ──

    /// Step 2: Complete the seal by querying metadata and publishing Wormhole VAA.
    /// Permissionless (anyone can call). Requires attached NEAR for Wormhole fee.
    #[payable]
    pub fn complete_seal_initiation(
        &mut self,
        nft_contract: AccountId,
        token_id: String,
    ) -> Promise {
        require!(!self.paused, "Contract is paused");

        let seal_key = self.compute_seal_key(&nft_contract, &token_id);
        let pending = self
            .pending_seals
            .get(&seal_key)
            .expect("No pending seal found for this NFT");
        require!(!pending.completed, "Seal already completed");

        // Cross-contract call to NFT contract to get metadata
        ext_nft::ext(nft_contract.clone())
            .with_static_gas(GAS_NFT_TOKEN)
            .nft_token(token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK_METADATA)
                    .with_attached_deposit(env::attached_deposit())
                    .on_nft_metadata_received(
                        nft_contract,
                        token_id,
                        pending.deposit_address.clone(),
                        pending.solana_receiver,
                        seal_key,
                    ),
            )
    }

    /// Callback: metadata received from NFT contract.
    #[private]
    #[payable]
    pub fn on_nft_metadata_received(
        &mut self,
        nft_contract: AccountId,
        token_id: String,
        deposit_address: String,
        solana_receiver: [u8; 32],
        seal_key: Vec<u8>,
    ) -> Promise {
        // Parse the nft_token result
        require!(
            env::promise_results_count() == 1,
            "Expected one promise result"
        );
        #[allow(deprecated)]
        let token: Option<Token> = match env::promise_result(0) {
            PromiseResult::Successful(data) => {
                serde_json::from_slice(&data).expect("Failed to parse nft_token result")
            }
            _ => env::panic_str("nft_token call failed"),
        };
        let token = token.expect("NFT not found");

        // Extract URI: prefer reference, fall back to media
        let token_uri = token
            .metadata
            .as_ref()
            .and_then(|m| m.reference.as_ref().or(m.media.as_ref()))
            .cloned()
            .unwrap_or_default();

        if token_uri.is_empty() {
            emit_token_uri_unavailable(nft_contract.as_str(), &token_id);
        }

        require!(token_uri.len() <= MAX_URI_LENGTH, "URI too long");

        // Build binary payload (wire format)
        let payload_bytes = build_seal_payload(
            nft_contract.as_str(),
            &token_id,
            &deposit_address,
            &solana_receiver,
            &token_uri,
        );

        // Hex-encode for Wormhole NEAR contract
        let payload_hex = hex::encode(&payload_bytes);

        let nonce = (self.sequence & 0xFFFF_FFFF) as u32;
        self.sequence += 1;
        let _local_sequence = self.sequence - 1;

        // Cross-contract call to Wormhole publish_message
        ext_wormhole::ext(self.wormhole_account.clone())
            .with_attached_deposit(env::attached_deposit())
            .with_static_gas(GAS_WORMHOLE_PUBLISH)
            .publish_message(payload_hex, nonce)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK_WORMHOLE)
                    .on_wormhole_published(
                        nft_contract,
                        token_id,
                        deposit_address,
                        solana_receiver,
                        token_uri,
                        seal_key,
                    ),
            )
    }

    /// Callback: Wormhole message published.
    #[private]
    pub fn on_wormhole_published(
        &mut self,
        nft_contract: AccountId,
        token_id: String,
        deposit_address: String,
        solana_receiver: [u8; 32],
        token_uri: String,
        seal_key: Vec<u8>,
    ) {
        require!(
            env::promise_results_count() == 1,
            "Expected one promise result"
        );
        #[allow(deprecated)]
        let wormhole_sequence: u64 = match env::promise_result(0) {
            PromiseResult::Successful(data) => {
                serde_json::from_slice(&data).expect("Failed to parse Wormhole sequence")
            }
            _ => env::panic_str("Wormhole publish_message failed"),
        };

        // Mark pending seal as completed
        if let Some(mut pending) = self.pending_seals.get(&seal_key) {
            pending.completed = true;
            pending.wormhole_sequence = wormhole_sequence;
            self.pending_seals.insert(&seal_key, &pending);
        }

        // Store completed seal record
        let record = SealRecord {
            nft_contract: nft_contract.clone(),
            token_id: token_id.clone(),
            deposit_address: deposit_address.clone(),
            solana_receiver,
            token_uri: token_uri.clone(),
            wormhole_sequence,
            source_chain_id: payload::WORMHOLE_CHAIN_ID_NEAR,
            sealed_at: env::block_timestamp(),
        };
        self.seal_records.insert(&seal_key, &record);

        // Emit NEP-297 event
        emit_seal_initiated(
            nft_contract.as_str(),
            &token_id,
            &deposit_address,
            &token_uri,
            &solana_receiver,
            wormhole_sequence,
        );

        log!(
            "SealInitiated: nft={} token_id={} seq={}",
            nft_contract,
            token_id,
            wormhole_sequence
        );
    }

    // ── Admin ──

    /// One-time setup: register this contract as a Wormhole emitter.
    #[payable]
    pub fn register_as_emitter(&mut self) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only owner can register emitter"
        );
        Promise::new(self.wormhole_account.clone()).function_call(
            "register_emitter".to_string(),
            b"{}".to_vec(),
            env::attached_deposit(),
            Gas::from_tgas(20),
        )
    }

    /// Update the Wormhole core bridge account.
    pub fn update_wormhole_account(&mut self, new_wormhole_account: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only owner"
        );
        require!(
            env::is_valid_account_id(new_wormhole_account.as_bytes()),
            "Invalid Wormhole account"
        );
        log!(
            "Wormhole account updated: {} -> {}",
            self.wormhole_account,
            new_wormhole_account
        );
        self.wormhole_account = new_wormhole_account;
    }

    /// Pause/unpause the contract.
    pub fn set_paused(&mut self, paused: bool) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only owner"
        );
        self.paused = paused;
    }

    /// Transfer ownership.
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only owner"
        );
        self.owner = new_owner;
    }

    /// Emergency unlock: release a stuck NFT back to its original deposit address.
    ///
    /// Only callable by the owner, and only for pending seals that have NOT been
    /// completed (Wormhole message not yet published). Enforces a minimum delay
    /// (24 hours) since the NFT was locked to prevent abuse.
    ///
    /// This is a safety valve for cases where complete_seal_initiation cannot
    /// succeed (e.g., Wormhole is down, metadata call fails permanently).
    pub fn emergency_unlock(
        &mut self,
        nft_contract: AccountId,
        token_id: String,
    ) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only owner can emergency unlock"
        );
        require!(!self.paused, "Contract is paused");

        let seal_key = self.compute_seal_key(&nft_contract, &token_id);
        let pending = self
            .pending_seals
            .get(&seal_key)
            .expect("No pending seal found for this NFT");

        require!(!pending.completed, "Seal already completed, cannot unlock");

        // Enforce minimum delay to prevent premature unlocks
        let elapsed = env::block_timestamp() - pending.created_at;
        require!(
            elapsed >= EMERGENCY_UNLOCK_DELAY_NS,
            "Emergency unlock not yet available (24h delay)"
        );

        // Clean up state: remove from sealed set and pending map
        self.sealed_nfts.remove(&seal_key);
        self.pending_seals.remove(&seal_key);

        log!(
            "EmergencyUnlock: contract={} token_id={} returning to={}",
            nft_contract,
            token_id,
            pending.deposit_address
        );

        // Transfer NFT back via nft_transfer
        let deposit_account: AccountId = pending.deposit_address.parse()
            .expect("Invalid deposit address for NFT return");
        Promise::new(nft_contract).function_call(
            "nft_transfer".to_string(),
            serde_json::json!({
                "receiver_id": deposit_account,
                "token_id": token_id,
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1), // 1 yoctoNEAR required for nft_transfer
            Gas::from_tgas(15),
        )
    }

    // ── View Functions ──

    /// Check if an NFT has been sealed.
    pub fn is_sealed(&self, nft_contract: AccountId, token_id: String) -> bool {
        let seal_key = self.compute_seal_key(&nft_contract, &token_id);
        self.sealed_nfts.contains(&seal_key)
    }

    /// Check if a pending seal exists but is not yet completed.
    pub fn is_pending(&self, nft_contract: AccountId, token_id: String) -> bool {
        let seal_key = self.compute_seal_key(&nft_contract, &token_id);
        match self.pending_seals.get(&seal_key) {
            Some(p) => !p.completed,
            None => false,
        }
    }

    /// Get a completed seal record.
    pub fn get_seal_record(
        &self,
        nft_contract: AccountId,
        token_id: String,
    ) -> Option<SealRecord> {
        let seal_key = self.compute_seal_key(&nft_contract, &token_id);
        self.seal_records.get(&seal_key)
    }

    /// Get the NEAR Wormhole chain ID (always 15).
    pub fn get_chain_id(&self) -> u16 {
        payload::WORMHOLE_CHAIN_ID_NEAR
    }

    /// Get the current sequence number.
    pub fn get_sequence(&self) -> u64 {
        self.sequence
    }

    /// Get the Wormhole contract account.
    pub fn get_wormhole_account(&self) -> AccountId {
        self.wormhole_account.clone()
    }

    // ── Internal ──

    /// Compute replay protection key: SHA256(nft_contract || token_id)
    fn compute_seal_key(&self, nft_contract: &AccountId, token_id: &str) -> Vec<u8> {
        let mut hasher = Sha256::new();
        hasher.update(nft_contract.as_str().as_bytes());
        hasher.update(token_id.as_bytes());
        hasher.finalize().to_vec()
    }
}

// ── NFT Receiver (Step 1: Lock NFT) ──

#[near]
impl NonFungibleTokenReceiver for SealInitiator {
    /// Called automatically when nft_transfer_call sends an NFT to this contract.
    ///
    /// Returns `PromiseOrValue::Value(false)` = keep the NFT (locked permanently).
    /// Returns `PromiseOrValue::Value(true)` = refund the NFT on error.
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        #[allow(unused_variables)]
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let nft_contract = env::predecessor_account_id();

        // Check not paused
        if self.paused {
            return PromiseOrValue::Value(true);
        }

        // NOTE: nft_on_transfer is called by the NFT contract as a cross-contract
        // callback — env::attached_deposit() is always 0 here regardless of what
        // the user attached to nft_transfer_call. Storage costs are covered by the
        // contract's own balance.

        // Parse seal parameters from msg
        let seal_msg: SealMsg = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(_) => {
                log!("Invalid seal msg JSON, refunding NFT");
                return PromiseOrValue::Value(true);
            }
        };

        // Validate solana_receiver is 32 bytes (64 hex chars)
        let receiver_hex = seal_msg
            .solana_receiver
            .strip_prefix("0x")
            .unwrap_or(&seal_msg.solana_receiver);
        if receiver_hex.len() != 64 {
            log!("solana_receiver must be 32 bytes hex, refunding NFT");
            return PromiseOrValue::Value(true);
        }
        let solana_receiver: [u8; 32] = match hex::decode(receiver_hex) {
            Ok(bytes) => match bytes.try_into() {
                Ok(arr) => arr,
                Err(_) => {
                    log!("solana_receiver must be exactly 32 bytes, refunding NFT");
                    return PromiseOrValue::Value(true);
                }
            },
            Err(_) => {
                log!("Invalid hex in solana_receiver, refunding NFT");
                return PromiseOrValue::Value(true);
            }
        };

        // Replay protection
        let seal_key = self.compute_seal_key(&nft_contract, &token_id);
        if self.sealed_nfts.contains(&seal_key) {
            log!("AlreadySealed: this NFT has already been sealed, refunding");
            return PromiseOrValue::Value(true);
        }
        self.sealed_nfts.insert(&seal_key);

        // Record pending seal
        let pending = PendingSeal {
            nft_contract: nft_contract.clone(),
            token_id: token_id.clone(),
            deposit_address: seal_msg.deposit_address,
            solana_receiver,
            completed: false,
            wormhole_sequence: 0,
            created_at: env::block_timestamp(),
        };
        self.pending_seals.insert(&seal_key, &pending);

        log!(
            "NFT locked: contract={} token_id={} sender={}",
            nft_contract,
            token_id,
            sender_id
        );

        // Return false = keep the NFT (locked)
        PromiseOrValue::Value(false)
    }
}
