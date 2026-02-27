// Ika Tensei - Orchestrator (v8: Treasury + Signing Integration)
//
// Two-phase seal process using Wormhole VAA + IKA dWallet:
//
//   Phase 1: process_vaa (called by relayer)
//     - Parse and verify Wormhole VAA (guardian signatures)
//     - Validate emitter address against known SealInitiator contracts
//     - Decode payload (nft_contract, token_id, deposit_address, receiver, token_uri)
//     - Validate dWallet against registry + check it hasn't been used before
//     - Construct signing message: sha256(token_uri || token_id || receiver)
//     - Store pending seal, emit SealPending
//
//   Phase 1.5: request_sign_seal (called by relayer)
//     - Withdraw coins from treasury
//     - Call signing::request_sign with the minting dWallet
//     - Return unused coins to treasury
//     - Relayer polls IKA for signature completion
//
//   Phase 2: complete_seal (called by relayer after IKA signing)
//     - Verify Ed25519 signature from the SHARED MINTING dWallet (MintingAuthority)
//     - Mark deposit dWallet as permanently used (one dWallet = one NFT)
//     - Emit SealSigned event for the Solana relayer
//
// Presign flow:
//   request_presign → signing::request_presign (treasury-funded)
//   UnverifiedPresignCap transferred to sender for later use in signing
//
// Treasury:
//   On-chain IKA/SUI pool. Admin tops up via add_ika_payment / add_sui_payment.
//   Every coordinator call uses withdraw → use → return pattern.

module ikatensei::orchestrator {
    use ika::ika::IKA;
    use sui::table::{Self, Table};
    use sui::event::emit;
    use sui::coin::Coin;
    use sui::sui::SUI;

    use wormhole::vaa;
    use wormhole::state::{State as WormholeState};
    use wormhole::external_address;
    use wormhole::bytes32;

    use ika_dwallet_2pc_mpc::coordinator::DWalletCoordinator;
    use ika_dwallet_2pc_mpc::coordinator_inner::UnverifiedPresignCap;

    use ikatensei::payload;
    use ikatensei::dwallet_registry::{Self, DWalletRegistry};
    use ikatensei::treasury::{Self, Treasury};
    use ikatensei::signing::{Self, SigningState};

    // Error codes
    const E_INVALID_DWALLET: u64 = 2;
    const E_DWALLET_MISMATCH: u64 = 3;
    const E_SIGNATURE_FAILED: u64 = 4;
    const E_INVALID_SOURCE_CHAIN: u64 = 6;
    const E_VAA_ALREADY_USED: u64 = 7;
    const E_INVALID_EMITTER: u64 = 8;
    const E_PENDING_SEAL_NOT_FOUND: u64 = 9;
    const E_SEAL_ALREADY_COMPLETED: u64 = 10;
    const E_DWALLET_ALREADY_USED: u64 = 11;
    const E_INVALID_RECEIVER: u64 = 12;
    const E_NFT_ALREADY_SEALED: u64 = 13;
    const E_INVALID_DEPOSIT_ADDRESS: u64 = 14;
    const E_MINTING_PUBKEY_NOT_SET: u64 = 15;

    // ==================================================================
    // Events
    // ==================================================================

    /// Emitted after successful Ed25519 signature verification.
    /// Relayer watches this event to submit the seal to Solana.
    public struct SealSigned has copy, drop {
        source_chain: u16,
        nft_contract: vector<u8>,
        token_id: vector<u8>,
        token_uri: vector<u8>,
        receiver: vector<u8>,
        deposit_address: vector<u8>,
        dwallet_pubkey: vector<u8>,
        message_hash: vector<u8>,
        signature: vector<u8>,
        vaa_hash: vector<u8>,
        timestamp: u64,
    }

    public struct SealPending has copy, drop {
        vaa_hash: vector<u8>,
        source_chain: u16,
        deposit_address: vector<u8>,
        receiver: vector<u8>,
        message_hash: vector<u8>,
        timestamp: u64,
    }

    public struct EmitterRegistered has copy, drop {
        chain_id: u16,
        emitter_address: vector<u8>,
    }

    // ==================================================================
    // Data Structures
    // ==================================================================

    /// Pending seal awaiting IKA dWallet signature.
    public struct PendingSeal has store, drop {
        source_chain: u16,
        nft_contract: vector<u8>,
        token_id: vector<u8>,
        token_uri: vector<u8>,
        receiver: vector<u8>,
        deposit_address: vector<u8>,
        dwallet_pubkey: vector<u8>,
        message_hash: vector<u8>,
        dwallet_id_bytes: vector<u8>,
        timestamp: u64,
        completed: bool,
    }

    /// Orchestrator state — shared object.
    public struct OrchestratorState has key {
        id: UID,
        /// VAA hash -> bool (replay protection)
        processed_vaas: Table<vector<u8>, bool>,
        /// chain_id -> expected emitter address (SealInitiator contract per chain)
        known_emitters: Table<u16, vector<u8>>,
        /// VAA hash -> PendingSeal (awaiting IKA signature)
        pending_seals: Table<vector<u8>, PendingSeal>,
        /// deposit_address -> bool (one-use dWallet tracking)
        used_dwallets: Table<vector<u8>, bool>,
        /// sha256(source_chain_be || nft_contract || token_id) -> bool
        /// Prevents the same source NFT from being bridged more than once.
        sealed_nfts: Table<vector<u8>, bool>,
        total_processed: u64,
        /// On-chain IKA/SUI pool for coordinator calls
        treasury: Treasury,
    }

    /// Admin capability for the orchestrator.
    public struct OrchestratorAdminCap has key, store {
        id: UID,
    }

    /// Shared minting authority — stores the pubkey of the shared IKA minting dWallet.
    public struct MintingAuthority has key {
        id: UID,
        /// Ed25519 public key of the shared minting dWallet (32 bytes).
        minting_pubkey: vector<u8>,
    }

    // ==================================================================
    // Init
    // ==================================================================

    fun init(ctx: &mut TxContext) {
        let sender = sui::tx_context::sender(ctx);

        let state = OrchestratorState {
            id: object::new(ctx),
            processed_vaas: table::new(ctx),
            known_emitters: table::new(ctx),
            pending_seals: table::new(ctx),
            used_dwallets: table::new(ctx),
            sealed_nfts: table::new(ctx),
            total_processed: 0,
            treasury: treasury::new(),
        };
        sui::transfer::share_object(state);

        let minting_authority = MintingAuthority {
            id: object::new(ctx),
            minting_pubkey: vector::empty(),
        };
        sui::transfer::share_object(minting_authority);

        let admin_cap = OrchestratorAdminCap {
            id: object::new(ctx),
        };
        sui::transfer::public_transfer(admin_cap, sender);
    }

    // ==================================================================
    // Admin: Emitter Registry
    // ==================================================================

    public fun register_emitter(
        state: &mut OrchestratorState,
        _cap: &OrchestratorAdminCap,
        chain_id: u16,
        emitter_address: vector<u8>,
    ) {
        assert!(vector::length(&emitter_address) == 32, E_INVALID_EMITTER);
        if (table::contains(&state.known_emitters, chain_id)) {
            *table::borrow_mut(&mut state.known_emitters, chain_id) = emitter_address;
        } else {
            table::add(&mut state.known_emitters, chain_id, emitter_address);
        };
        emit(EmitterRegistered { chain_id, emitter_address });
    }

    public fun remove_emitter(
        state: &mut OrchestratorState,
        _cap: &OrchestratorAdminCap,
        chain_id: u16,
    ) {
        if (table::contains(&state.known_emitters, chain_id)) {
            table::remove(&mut state.known_emitters, chain_id);
        };
    }

    // ==================================================================
    // Admin: Minting Authority + Minting dWallet
    // ==================================================================

    /// Set (or update) the shared minting dWallet's Ed25519 public key.
    public fun set_minting_pubkey(
        authority: &mut MintingAuthority,
        _cap: &OrchestratorAdminCap,
        minting_pubkey: vector<u8>,
    ) {
        assert!(vector::length(&minting_pubkey) == 32, E_SIGNATURE_FAILED);
        authority.minting_pubkey = minting_pubkey;
    }

    /// Update the signing parameters stored in SigningState.
    /// Used after an upgrade to fix incorrect IKA curve/algorithm numbers.
    public fun update_signing_params(
        signing_state: &mut SigningState,
        _cap: &OrchestratorAdminCap,
        curve: u32,
        signature_algorithm: u32,
        hash_scheme: u32,
    ) {
        signing::update_params(signing_state, curve, signature_algorithm, hash_scheme);
    }

    /// Reset the minting cap in SigningState (e.g. after a rejected DKG).
    /// The old DWalletCap is transferred to the caller for disposal.
    public fun reset_minting_cap(
        signing_state: &mut SigningState,
        _cap: &OrchestratorAdminCap,
        ctx: &mut TxContext,
    ) {
        signing::reset_minting_cap(signing_state, ctx);
    }

    /// Create the contract's own minting dWallet via IKA DKG.
    /// Called once after deployment. The DWalletCap goes directly into
    /// SigningState and never leaves contract control.
    /// The relayer provides DKG inputs from prepareDKGAsync() via the IKA SDK.
    public fun create_minting_dwallet(
        state: &mut OrchestratorState,
        signing_state: &mut SigningState,
        _cap: &OrchestratorAdminCap,
        coordinator: &mut DWalletCoordinator,
        dwallet_network_encryption_key_id: ID,
        centralized_public_key_share_and_proof: vector<u8>,
        user_public_output: vector<u8>,
        public_user_secret_key_share: vector<u8>,
        session_bytes: vector<u8>,
        ctx: &mut TxContext,
    ) {
        signing::create_minting_dwallet(
            signing_state,
            &mut state.treasury,
            coordinator,
            dwallet_network_encryption_key_id,
            centralized_public_key_share_and_proof,
            user_public_output,
            public_user_secret_key_share,
            session_bytes,
            ctx,
        );
    }

    // ==================================================================
    // Admin: Treasury
    // ==================================================================

    /// Top up the treasury with IKA tokens (for coordinator fees).
    public fun add_ika_payment(
        state: &mut OrchestratorState,
        _cap: &OrchestratorAdminCap,
        coin: Coin<IKA>,
    ) {
        state.treasury.add_ika(coin);
    }

    /// Top up the treasury with SUI tokens (for coordinator fees).
    public fun add_sui_payment(
        state: &mut OrchestratorState,
        _cap: &OrchestratorAdminCap,
        coin: Coin<SUI>,
    ) {
        state.treasury.add_sui(coin);
    }

    // ==================================================================
    // Phase 1: process_vaa — Verify Wormhole VAA and store pending seal
    // ==================================================================

    public fun process_vaa(
        state: &mut OrchestratorState,
        _cap: &OrchestratorAdminCap,
        wormhole_state: &WormholeState,
        registry: &DWalletRegistry,
        vaa_bytes: vector<u8>,
        dwallet_id: ID,
        clock: &sui::clock::Clock,
        _ctx: &mut TxContext,
    ) {
        let timestamp = sui::clock::timestamp_ms(clock) / 1000;

        // ── Step 1: Parse and verify VAA ──
        let verified_vaa = vaa::parse_and_verify(wormhole_state, vaa_bytes, clock);

        let emitter_chain = vaa::emitter_chain(&verified_vaa);
        let emitter_addr = external_address::to_bytes(vaa::emitter_address(&verified_vaa));
        let vaa_hash = bytes32::to_bytes(vaa::digest(&verified_vaa));

        let (_chain, _addr, payload_bytes) = vaa::take_emitter_info_and_payload(verified_vaa);

        // ── Step 2: Validate emitter ──
        assert!(table::contains(&state.known_emitters, emitter_chain), E_INVALID_SOURCE_CHAIN);
        let expected = *table::borrow(&state.known_emitters, emitter_chain);
        assert!(expected == emitter_addr, E_INVALID_EMITTER);

        // ── Step 3: Replay protection ──
        assert!(!table::contains(&state.processed_vaas, vaa_hash), E_VAA_ALREADY_USED);

        // ── Step 4: Decode payload ──
        let seal_payload = payload::decode_seal_payload(&payload_bytes);
        let deposit_address = *payload::get_deposit_address(&seal_payload);

        // ── Step 5: One-use dWallet check ──
        assert!(!table::contains(&state.used_dwallets, deposit_address), E_DWALLET_ALREADY_USED);

        // ── Step 5.5: Duplicate NFT check (same source NFT can't be bridged twice) ──
        let source_chain_val = payload::get_source_chain(&seal_payload);
        let mut nft_key = vector::empty<u8>();
        vector::push_back(&mut nft_key, ((source_chain_val >> 8) as u8));
        vector::push_back(&mut nft_key, ((source_chain_val & 0xFF) as u8));
        vector::append(&mut nft_key, *payload::get_nft_contract(&seal_payload));
        vector::append(&mut nft_key, *payload::get_token_id(&seal_payload));
        let nft_hash = std::hash::sha2_256(nft_key);
        assert!(!table::contains(&state.sealed_nfts, nft_hash), E_NFT_ALREADY_SEALED);
        table::add(&mut state.sealed_nfts, nft_hash, true);

        // ── Step 6: Registry validation ──
        assert!(dwallet_registry::is_registered(registry, &deposit_address), E_INVALID_DWALLET);

        let registered_dwallet_id = dwallet_registry::get_dwallet_id(registry, &deposit_address);
        let dwallet_id_bytes = object::id_to_bytes(&dwallet_id);
        assert!(registered_dwallet_id == dwallet_id_bytes, E_DWALLET_MISMATCH);

        let dwallet_pubkey = dwallet_registry::get_dwallet_pubkey(registry, &deposit_address);

        // ── Step 7: Construct signing message ──
        let message_hash = payload::construct_signing_message(
            payload::get_token_uri(&seal_payload),
            payload::get_token_id(&seal_payload),
            payload::get_receiver(&seal_payload),
        );

        // ── Step 8: Store pending seal ──
        let pending = PendingSeal {
            source_chain: payload::get_source_chain(&seal_payload),
            nft_contract: *payload::get_nft_contract(&seal_payload),
            token_id: *payload::get_token_id(&seal_payload),
            token_uri: *payload::get_token_uri(&seal_payload),
            receiver: *payload::get_receiver(&seal_payload),
            deposit_address,
            dwallet_pubkey,
            message_hash,
            dwallet_id_bytes,
            timestamp,
            completed: false,
        };

        table::add(&mut state.pending_seals, vaa_hash, pending);
        table::add(&mut state.processed_vaas, vaa_hash, true);

        emit(SealPending {
            vaa_hash,
            source_chain: payload::get_source_chain(&seal_payload),
            deposit_address,
            receiver: *payload::get_receiver(&seal_payload),
            message_hash,
            timestamp,
        });
    }

    // ==================================================================
    // Phase 1.5: request_sign_seal — Treasury-funded IKA signing
    // ==================================================================

    /// Request IKA 2PC-MPC signing for a pending seal.
    /// Withdraws coins from treasury, calls signing::request_sign, returns unused coins.
    /// The relayer must poll IKA for signature completion, then call complete_seal.
    public fun request_sign_seal(
        state: &mut OrchestratorState,
        signing_state: &mut SigningState,
        coordinator: &mut DWalletCoordinator,
        _cap: &OrchestratorAdminCap,
        vaa_hash: vector<u8>,
        message_centralized_signature: vector<u8>,
        unverified_cap: UnverifiedPresignCap,
        request: u64,
        ctx: &mut TxContext,
    ) {
        // Look up the pending seal to get the message_hash
        assert!(table::contains(&state.pending_seals, vaa_hash), E_PENDING_SEAL_NOT_FOUND);
        let pending = table::borrow(&state.pending_seals, vaa_hash);
        assert!(!pending.completed, E_SEAL_ALREADY_COMPLETED);
        let message = pending.message_hash;

        // Withdraw coins from treasury
        let (mut payment_ika, mut payment_sui) = state.treasury.withdraw_coins(ctx);

        // Request signing via signing module
        let _signature_id = signing::request_sign(
            signing_state,
            coordinator,
            message,
            message_centralized_signature,
            unverified_cap,
            vaa_hash,
            request,
            &mut payment_ika,
            &mut payment_sui,
            ctx,
        );

        // Return unused coins to treasury
        state.treasury.return_coins(payment_ika, payment_sui);
    }

    // ==================================================================
    // Presign: Treasury-funded presign requests
    // ==================================================================

    /// Request a global presign from the IKA coordinator (treasury-funded).
    /// The UnverifiedPresignCap is transferred to the sender for later use.
    public fun request_presign(
        state: &mut OrchestratorState,
        coordinator: &mut DWalletCoordinator,
        _cap: &OrchestratorAdminCap,
        enc_key_id: ID,
        request: u64,
        ctx: &mut TxContext,
    ) {
        let (mut payment_ika, mut payment_sui) = state.treasury.withdraw_coins(ctx);

        signing::request_presign(
            coordinator,
            enc_key_id,
            request,
            &mut payment_ika,
            &mut payment_sui,
            ctx,
        );

        state.treasury.return_coins(payment_ika, payment_sui);
    }

    // ==================================================================
    // Centralized seal — Admin-only, bypasses Wormhole VAA
    // ==================================================================

    /// Create a pending seal from relayer-provided data (centralized flow).
    /// Bypasses Wormhole VAA verification — the relayer has already verified
    /// the NFT deposit on the source chain via RPC.
    /// Requires AdminCap (only the relayer operator can call this).
    /// Emits SealPending — the existing signing flow handles the rest.
    public fun create_centralized_seal(
        state: &mut OrchestratorState,
        _cap: &OrchestratorAdminCap,
        minting_authority: &MintingAuthority,
        source_chain: u16,
        nft_contract: vector<u8>,
        token_id: vector<u8>,
        token_uri: vector<u8>,
        deposit_address: vector<u8>,
        receiver: vector<u8>,
        clock: &sui::clock::Clock,
        _ctx: &mut TxContext,
    ) {
        let timestamp = sui::clock::timestamp_ms(clock) / 1000;

        // Validate receiver is 32 bytes (Solana pubkey)
        assert!(vector::length(&receiver) == 32, E_INVALID_RECEIVER);

        // Validate deposit_address has valid length (20 for EVM, 32 for others)
        let addr_len = vector::length(&deposit_address);
        assert!(addr_len == 20 || addr_len == 32, E_INVALID_DEPOSIT_ADDRESS);

        // Validate minting pubkey is set (32 bytes for Ed25519)
        assert!(vector::length(&minting_authority.minting_pubkey) == 32, E_MINTING_PUBKEY_NOT_SET);

        // One-use dWallet check — prevents reusing a deposit address
        assert!(!table::contains(&state.used_dwallets, deposit_address), E_DWALLET_ALREADY_USED);

        // Prevent duplicate bridging: same (source_chain, nft_contract, token_id) can only be sealed once
        let mut nft_key = vector::empty<u8>();
        vector::push_back(&mut nft_key, ((source_chain >> 8) as u8));
        vector::push_back(&mut nft_key, ((source_chain & 0xFF) as u8));
        vector::append(&mut nft_key, copy nft_contract);
        vector::append(&mut nft_key, copy token_id);
        let nft_hash = std::hash::sha2_256(nft_key);
        assert!(!table::contains(&state.sealed_nfts, nft_hash), E_NFT_ALREADY_SEALED);
        table::add(&mut state.sealed_nfts, nft_hash, true);

        // Compute seal_hash as unique key: sha256(source_chain_be || nft_contract || token_id || receiver)
        let mut hash_input = vector::empty<u8>();
        vector::push_back(&mut hash_input, ((source_chain >> 8) as u8));
        vector::push_back(&mut hash_input, ((source_chain & 0xFF) as u8));
        vector::append(&mut hash_input, nft_contract);
        vector::append(&mut hash_input, token_id);
        vector::append(&mut hash_input, receiver);
        let seal_hash = std::hash::sha2_256(hash_input);

        // Replay protection
        assert!(!table::contains(&state.processed_vaas, seal_hash), E_VAA_ALREADY_USED);

        // Construct signing message: sha256(token_uri || token_id || receiver)
        let message_hash = payload::construct_signing_message(&token_uri, &token_id, &receiver);

        // Store pending seal
        let pending = PendingSeal {
            source_chain,
            nft_contract,
            token_id,
            token_uri,
            receiver,
            deposit_address,
            dwallet_pubkey: minting_authority.minting_pubkey,
            message_hash,
            dwallet_id_bytes: vector::empty(),
            timestamp,
            completed: false,
        };

        table::add(&mut state.pending_seals, seal_hash, pending);
        table::add(&mut state.processed_vaas, seal_hash, true);

        // Emit SealPending — existing SealSigner picks this up identically to VAA-based seals
        emit(SealPending {
            vaa_hash: seal_hash,
            source_chain,
            deposit_address,
            receiver,
            message_hash,
            timestamp,
        });
    }

    // ==================================================================
    // Phase 2: complete_seal — Submit IKA signature and emit SealSigned
    // ==================================================================

    /// Complete a pending seal by providing the IKA dWallet Ed25519 signature.
    /// The minting DWalletCap stays permanently in SigningState (no DWalletCap param needed).
    public fun complete_seal(
        state: &mut OrchestratorState,
        registry: &mut DWalletRegistry,
        minting_authority: &MintingAuthority,
        _cap: &OrchestratorAdminCap,
        vaa_hash: vector<u8>,
        signature: vector<u8>,
        clock: &sui::clock::Clock,
        _ctx: &mut TxContext,
    ) {
        let timestamp = sui::clock::timestamp_ms(clock) / 1000;

        // ── Step 1: Look up pending seal ──
        assert!(table::contains(&state.pending_seals, vaa_hash), E_PENDING_SEAL_NOT_FOUND);
        let pending = table::borrow_mut(&mut state.pending_seals, vaa_hash);
        assert!(!pending.completed, E_SEAL_ALREADY_COMPLETED);

        // ── Step 2: Verify Ed25519 signature from the SHARED MINTING dWallet ──
        assert!(vector::length(&signature) == 64, E_SIGNATURE_FAILED);
        assert!(vector::length(&minting_authority.minting_pubkey) == 32, E_SIGNATURE_FAILED);
        let valid = sui::ed25519::ed25519_verify(
            &signature,
            &minting_authority.minting_pubkey,
            &pending.message_hash,
        );
        assert!(valid, E_SIGNATURE_FAILED);

        // ── Step 3: Mark completed ──
        pending.completed = true;
        state.total_processed = state.total_processed + 1;

        // ── Step 4: Mark deposit dWallet as permanently used ──
        if (!table::contains(&state.used_dwallets, pending.deposit_address)) {
            table::add(&mut state.used_dwallets, pending.deposit_address, true);
        };
        // Only mark in registry if the deposit address has a registry record
        // (centralized seals bypass the dWallet registry)
        if (dwallet_registry::has_record(registry, &pending.deposit_address)) {
            dwallet_registry::mark_dwallet_used(registry, &pending.deposit_address);
        };

        // ── Step 5: Emit SealSigned event ──
        emit(SealSigned {
            source_chain: pending.source_chain,
            nft_contract: pending.nft_contract,
            token_id: pending.token_id,
            token_uri: pending.token_uri,
            receiver: pending.receiver,
            deposit_address: pending.deposit_address,
            dwallet_pubkey: minting_authority.minting_pubkey,
            message_hash: pending.message_hash,
            signature,
            vaa_hash,
            timestamp,
        });
    }

    // ==================================================================
    // View functions
    // ==================================================================

    public fun verify_signature(
        pubkey: &vector<u8>,
        message: &vector<u8>,
        signature: &vector<u8>,
    ): bool {
        if (vector::length(signature) != 64) {
            return false
        };
        sui::ed25519::ed25519_verify(signature, pubkey, message)
    }

    public fun is_vaa_processed(state: &OrchestratorState, vaa_hash: &vector<u8>): bool {
        table::contains(&state.processed_vaas, *vaa_hash)
    }

    public fun total_processed(state: &OrchestratorState): u64 {
        state.total_processed
    }

    public fun has_known_emitter(state: &OrchestratorState, chain_id: u16): bool {
        table::contains(&state.known_emitters, chain_id)
    }

    public fun get_known_emitter(state: &OrchestratorState, chain_id: u16): vector<u8> {
        *table::borrow(&state.known_emitters, chain_id)
    }

    public fun is_seal_pending(state: &OrchestratorState, vaa_hash: &vector<u8>): bool {
        table::contains(&state.pending_seals, *vaa_hash) &&
        !table::borrow(&state.pending_seals, *vaa_hash).completed
    }

    public fun is_seal_completed(state: &OrchestratorState, vaa_hash: &vector<u8>): bool {
        table::contains(&state.pending_seals, *vaa_hash) &&
        table::borrow(&state.pending_seals, *vaa_hash).completed
    }

    public fun is_dwallet_used(state: &OrchestratorState, deposit_address: &vector<u8>): bool {
        table::contains(&state.used_dwallets, *deposit_address)
    }

    public fun get_minting_pubkey(authority: &MintingAuthority): vector<u8> {
        authority.minting_pubkey
    }

    public fun treasury_ika_balance(state: &OrchestratorState): u64 {
        state.treasury.ika_balance()
    }

    public fun treasury_sui_balance(state: &OrchestratorState): u64 {
        state.treasury.sui_balance()
    }
}
