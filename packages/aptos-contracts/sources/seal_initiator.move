/// Ika Tensei SealInitiator for Aptos
///
/// Permissionless contract to initiate NFT seal for cross-chain rebirth.
/// Verifies Digital Asset (Token v2) ownership at a deposit address,
/// reads token URI, builds a Wormhole-compatible binary payload, and
/// publishes a real Wormhole message via the Aptos core bridge.
///
/// Payload wire format (matches EVM SealInitiator exactly):
///   [0]       payload_type    (1 byte)  = 0x01
///   [1-2]     source_chain    (2 bytes) = 0x0016 (Aptos, chain 22)
///   [3-34]    nft_contract    (32 bytes, creator address)
///   [35-66]   token_id        (32 bytes, token object address)
///   [67-98]   deposit_address (32 bytes)
///   [99-130]  receiver        (32 bytes, Solana pubkey)
///   [131+]    token_uri       (variable, raw UTF-8, no prefix)
module ika_tensei_aptos::seal_initiator {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use std::bcs;
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::table::{Self, Table};
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_token_objects::token::{Self, Token};
    use wormhole::wormhole;
    use wormhole::emitter::EmitterCapability;

    // ── Constants ──

    /// Payload type for SealAttestation
    const PAYLOAD_TYPE_SEAL: u8 = 1;

    /// Wormhole chain ID for Aptos (u16 matching wire format)
    const SOURCE_CHAIN_APTOS: u16 = 22;

    /// Maximum token URI length (prevents gas-griefing)
    const MAX_URI_LENGTH: u64 = 2048;

    // ── Error codes ──

    const E_NOT_AT_DEPOSIT_ADDRESS: u64 = 1;
    const E_ALREADY_SEALED: u64 = 2;
    const E_INSUFFICIENT_FEE: u64 = 3;
    const E_INVALID_RECEIVER: u64 = 4;
    const E_URI_TOO_LONG: u64 = 5;
    const E_NOT_OWNER: u64 = 6;
    const E_PAUSED: u64 = 7;
    const E_NOT_INITIALIZED: u64 = 8;
    const E_ALREADY_INITIALIZED: u64 = 9;

    // ── State ──

    /// Module-level state, stored at the deployer's address.
    struct SealState has key {
        /// Admin/owner address
        owner: address,
        /// Replay protection: token_object_address => bool
        sealed_tokens: Table<address, bool>,
        /// Monotonic nonce for Wormhole messages
        nonce: u64,
        /// Running count of sealed NFTs
        total_sealed: u64,
        /// Whether the contract is paused
        paused: bool,
        /// Wormhole emitter capability (manages sequence internally)
        emitter_cap: EmitterCapability,
    }

    // ── Events ──

    #[event]
    struct SealInitiated has drop, store {
        /// Creator address of the NFT collection (nft_contract equivalent)
        nft_contract: address,
        /// Token object address (serves as token_id)
        token_id: address,
        /// dWallet deposit address where NFT was held
        deposit_address: address,
        /// Token URI string
        token_uri: String,
        /// Solana receiver wallet (32 bytes hex)
        solana_receiver: vector<u8>,
        /// Wormhole sequence number
        wormhole_sequence: u64,
        /// Source chain ID (always 22 for Aptos)
        source_chain_id: u16,
        /// The raw binary payload for relayer consumption
        payload: vector<u8>,
    }

    #[event]
    struct TokenURIUnavailable has drop, store {
        nft_contract: address,
        token_id: address,
    }

    // ── Init ──

    /// Initialize the SealInitiator. Must be called once by the deployer.
    /// Registers this contract as a Wormhole emitter.
    public entry fun initialize(deployer: &signer) {
        let deployer_addr = signer::address_of(deployer);
        assert!(!exists<SealState>(deployer_addr), E_ALREADY_INITIALIZED);

        let emitter_cap = wormhole::register_emitter();

        let state = SealState {
            owner: deployer_addr,
            sealed_tokens: table::new(),
            nonce: 0,
            total_sealed: 0,
            paused: false,
            emitter_cap,
        };

        move_to(deployer, state);
    }

    // ── Core Function ──

    /// Initiate seal for an Aptos Digital Asset (Token v2).
    ///
    /// Permissionless: anyone can call for any deposit address.
    /// The NFT must be owned by `deposit_address` at call time.
    /// The caller pays the Wormhole message fee in APT.
    ///
    /// Flow:
    /// 1. Replay protection (token address is unique per token)
    /// 2. Verify NFT ownership at deposit_address
    /// 3. Read token URI
    /// 4. Build binary payload (wire format)
    /// 5. Publish Wormhole message (real VAA via core bridge)
    /// 6. Emit SealInitiated event
    public entry fun initiate_seal(
        caller: &signer,
        contract_address: address,
        token: Object<Token>,
        deposit_address: address,
        solana_receiver: vector<u8>,
    ) acquires SealState {
        let state = borrow_global_mut<SealState>(contract_address);

        // 0. Check not paused
        assert!(!state.paused, E_PAUSED);

        // 0b. Validate inputs
        assert!(vector::length(&solana_receiver) == 32, E_INVALID_RECEIVER);

        // 1. Get token object address (serves as token_id in wire format)
        let token_address = object::object_address(&token);

        // 2. Replay protection
        assert!(
            !table::contains(&state.sealed_tokens, token_address),
            E_ALREADY_SEALED,
        );
        table::add(&mut state.sealed_tokens, token_address, true);

        // 3. Verify NFT is at deposit address
        let current_owner = object::owner(token);
        assert!(current_owner == deposit_address, E_NOT_AT_DEPOSIT_ADDRESS);

        // 4. Read token URI
        let uri: String = token::uri(token);
        let uri_bytes = *string::bytes(&uri);

        if (vector::is_empty(&uri_bytes)) {
            let creator_address: address = token::creator(token);
            event::emit(TokenURIUnavailable {
                nft_contract: creator_address,
                token_id: token_address,
            });
        };

        assert!(
            (vector::length(&uri_bytes) as u64) <= MAX_URI_LENGTH,
            E_URI_TOO_LONG,
        );

        // 5. Read creator address (serves as nft_contract)
        let creator_address: address = token::creator(token);

        // 6. Build binary payload (wire format)
        let payload = build_payload(
            creator_address,
            token_address,
            deposit_address,
            solana_receiver,
            uri_bytes,
        );

        // 7. Publish message via Wormhole core bridge
        let nonce = state.nonce;
        state.nonce = state.nonce + 1;
        state.total_sealed = state.total_sealed + 1;

        // Pay Wormhole fee (currently 0 on Aptos, but handle non-zero for future)
        let message_fee = wormhole::state::get_message_fee();
        let fee_coins = if (message_fee > 0) {
            coin::withdraw<AptosCoin>(caller, message_fee)
        } else {
            coin::zero<AptosCoin>()
        };

        let seq = wormhole::publish_message(
            &mut state.emitter_cap,
            nonce,
            payload,
            fee_coins,
        );

        // 8. Emit indexing event
        event::emit(SealInitiated {
            nft_contract: creator_address,
            token_id: token_address,
            deposit_address,
            token_uri: uri,
            solana_receiver,
            wormhole_sequence: seq,
            source_chain_id: SOURCE_CHAIN_APTOS,
            payload,
        });
    }

    // ── Payload Construction ──

    /// Build the binary Wormhole payload matching the canonical wire format.
    ///
    /// Layout (131 + len(token_uri) bytes):
    ///   [0]       payload_type    (1 byte)  = 0x01
    ///   [1-2]     source_chain    (2 bytes) = 0x0016 (Aptos)
    ///   [3-34]    nft_contract    (32 bytes, creator address)
    ///   [35-66]   token_id        (32 bytes, token object address)
    ///   [67-98]   deposit_address (32 bytes)
    ///   [99-130]  receiver        (32 bytes, Solana pubkey)
    ///   [131+]    token_uri       (variable, raw UTF-8, no prefix)
    fun build_payload(
        creator_address: address,
        token_address: address,
        deposit_address: address,
        solana_receiver: vector<u8>,
        token_uri: vector<u8>,
    ): vector<u8> {
        let payload = vector::empty<u8>();

        // [0] payload_type = 1
        vector::push_back(&mut payload, PAYLOAD_TYPE_SEAL);

        // [1-2] source_chain = 22 (big-endian u16)
        vector::push_back(&mut payload, (((SOURCE_CHAIN_APTOS as u64) >> 8) & 0xFF as u8));
        vector::push_back(&mut payload, ((SOURCE_CHAIN_APTOS as u64) & 0xFF as u8));

        // [3-34] nft_contract = creator address (32 bytes)
        let creator_bytes = bcs::to_bytes(&creator_address);
        vector::append(&mut payload, creator_bytes);

        // [35-66] token_id = token object address (32 bytes)
        let token_bytes = bcs::to_bytes(&token_address);
        vector::append(&mut payload, token_bytes);

        // [67-98] deposit_address (32 bytes)
        let deposit_bytes = bcs::to_bytes(&deposit_address);
        vector::append(&mut payload, deposit_bytes);

        // [99-130] receiver = Solana pubkey (32 bytes, already raw)
        vector::append(&mut payload, solana_receiver);

        // [131+] token_uri (variable, raw UTF-8, no length prefix)
        vector::append(&mut payload, token_uri);

        payload
    }

    // ── Admin Functions ──

    /// Pause/unpause the contract.
    public entry fun set_paused(
        caller: &signer,
        contract_address: address,
        paused: bool,
    ) acquires SealState {
        let state = borrow_global_mut<SealState>(contract_address);
        assert!(signer::address_of(caller) == state.owner, E_NOT_OWNER);
        state.paused = paused;
    }

    /// Transfer ownership.
    public entry fun transfer_ownership(
        caller: &signer,
        contract_address: address,
        new_owner: address,
    ) acquires SealState {
        let state = borrow_global_mut<SealState>(contract_address);
        assert!(signer::address_of(caller) == state.owner, E_NOT_OWNER);
        state.owner = new_owner;
    }

    // ── View Functions ──

    #[view]
    /// Returns true if this token has already been sealed.
    public fun is_sealed(contract_address: address, token_address: address): bool acquires SealState {
        let state = borrow_global<SealState>(contract_address);
        table::contains(&state.sealed_tokens, token_address)
    }

    #[view]
    /// Returns the total number of sealed NFTs.
    public fun total_sealed(contract_address: address): u64 acquires SealState {
        let state = borrow_global<SealState>(contract_address);
        state.total_sealed
    }

    #[view]
    /// Returns the current nonce.
    public fun current_nonce(contract_address: address): u64 acquires SealState {
        let state = borrow_global<SealState>(contract_address);
        state.nonce
    }

    #[view]
    /// Returns the current Wormhole message fee in octas.
    public fun wormhole_fee(): u64 {
        wormhole::state::get_message_fee()
    }

    #[view]
    /// Returns the Aptos Wormhole chain ID (always 22).
    public fun get_chain_id(): u16 {
        SOURCE_CHAIN_APTOS
    }

    // ── Test helpers ──

    #[test_only]
    /// Expose build_payload for testing.
    public fun build_payload_for_test(
        creator_address: address,
        token_address: address,
        deposit_address: address,
        solana_receiver: vector<u8>,
        token_uri: vector<u8>,
    ): vector<u8> {
        build_payload(creator_address, token_address, deposit_address, solana_receiver, token_uri)
    }
}
