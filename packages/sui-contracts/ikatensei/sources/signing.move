// Ika Tensei - Signing
//
// The contract owns its own dedicated minting dWallet for signing seal
// attestations. This is SEPARATE from the per-NFT deposit dWallets (which
// are only for receiving NFTs and are one-use).
//
// The minting dWallet is created by the contract itself via
// create_minting_dwallet() → dwallet_factory. The DWalletCap goes directly
// into SigningState and never leaves contract control.
//
// Sign flow:
//   1. verify_presign_cap → VerifiedPresignCap
//   2. approve_message(&minting_cap, sig_algo, hash_scheme, message)
//   3. request_sign_and_return_id(verified, approval, centralized_sig, session, ika, sui)
//
// Presign flow:
//   request_global_presign(enc_key_id, curve, sig_algo, session, ika, sui)
//   → UnverifiedPresignCap transferred to sender (relayer stores object ID)

module ikatensei::signing {
    use ika::ika::IKA;
    use ika_dwallet_2pc_mpc::coordinator::DWalletCoordinator;
    use ika_dwallet_2pc_mpc::coordinator_inner::{DWalletCap, UnverifiedPresignCap};
    use ika_dwallet_2pc_mpc::sessions_manager::SessionIdentifier;
    use sui::{bcs, coin::Coin, event::emit, sui::SUI};

    use ikatensei::treasury::Treasury;
    use ikatensei::dwallet_factory;

    // ── Error codes ──

    const E_MINTING_CAP_NOT_SET: u64 = 100;
    const E_MINTING_CAP_ALREADY_SET: u64 = 101;

    // ── Events ──

    public struct SignRequested has copy, drop {
        request: u64,
        vaa_hash: vector<u8>,
        signature_id: ID,
    }

    public struct PresignRequested has copy, drop {
        request: u64,
        presign_bcs: vector<u8>,
    }

    public struct MintingDWalletCreated has copy, drop {
        dwallet_cap_id: ID,
        dwallet_id: ID,
    }

    // ── State ──

    /// Contract-owned signing state. Holds the minting dWallet's DWalletCap
    /// permanently. This dWallet is created by the contract (not externally)
    /// and is used exclusively for signing seal attestations.
    /// Deposit dWallets (per-NFT, one-use) are completely separate.
    public struct SigningState has key {
        id: UID,
        /// The contract's own minting dWallet capability.
        /// Created via create_minting_dwallet(), never leaves this struct.
        minting_cap: Option<DWalletCap>,
        /// EdDSA = 0 (relative to Ed25519 curve)
        signature_algorithm: u32,
        /// SHA512 = 0 (relative to Ed25519 + EdDSA)
        hash_scheme: u32,
        /// Ed25519 = 2 (IKA curve: SECP256K1=0, SECP256R1=1, ED25519=2, RISTRETTO=3)
        curve: u32,
    }

    // ── Init ──

    fun init(ctx: &mut TxContext) {
        let state = SigningState {
            id: object::new(ctx),
            minting_cap: option::none(),
            signature_algorithm: 0,
            hash_scheme: 0,
            curve: 2,
        };
        sui::transfer::share_object(state);
    }

    // ── Minting dWallet Creation ──

    /// Create the contract's own minting dWallet via DKG.
    /// The DWalletCap goes directly into SigningState — it never leaves
    /// contract control. Treasury pays for the coordinator fees.
    ///
    /// Called once by admin after deployment. The relayer provides DKG inputs
    /// from prepareDKGAsync() via the TypeScript SDK.
    public(package) fun create_minting_dwallet(
        state: &mut SigningState,
        treasury: &mut Treasury,
        coordinator: &mut DWalletCoordinator,
        dwallet_network_encryption_key_id: ID,
        centralized_public_key_share_and_proof: vector<u8>,
        user_public_output: vector<u8>,
        public_user_secret_key_share: vector<u8>,
        session_bytes: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(state.minting_cap.is_none(), E_MINTING_CAP_ALREADY_SET);

        // Create the dWallet via factory, treasury-funded
        let dwallet_cap = dwallet_factory::create_shared_dwallet_with_treasury(
            treasury,
            coordinator,
            dwallet_network_encryption_key_id,
            state.curve,
            centralized_public_key_share_and_proof,
            user_public_output,
            public_user_secret_key_share,
            session_bytes,
            ctx,
        );

        let cap_id = object::id(&dwallet_cap);
        let dwallet_id = dwallet_cap.dwallet_id();

        // Store permanently — cap never leaves SigningState
        state.minting_cap.fill(dwallet_cap);

        emit(MintingDWalletCreated {
            dwallet_cap_id: cap_id,
            dwallet_id,
        });
    }

    // ── Signing ──

    /// Sign a message using the contract's minting dWallet.
    /// Returns the IKA signature_id (poll via getSignInParticularState).
    public(package) fun request_sign(
        state: &SigningState,
        coordinator: &mut DWalletCoordinator,
        message: vector<u8>,
        message_centralized_signature: vector<u8>,
        unverified_cap: UnverifiedPresignCap,
        vaa_hash: vector<u8>,
        request: u64,
        payment_ika: &mut Coin<IKA>,
        payment_sui: &mut Coin<SUI>,
        ctx: &mut TxContext,
    ): ID {
        assert!(state.minting_cap.is_some(), E_MINTING_CAP_NOT_SET);

        let cap = state.minting_cap.borrow();

        let verified_cap = coordinator.verify_presign_cap(unverified_cap, ctx);
        let session_identifier = random_session_identifier(coordinator, ctx);

        let message_approval = coordinator.approve_message(
            cap,
            state.signature_algorithm,
            state.hash_scheme,
            message,
        );

        let signature_id = coordinator.request_sign_and_return_id(
            verified_cap,
            message_approval,
            message_centralized_signature,
            session_identifier,
            payment_ika,
            payment_sui,
            ctx,
        );

        emit(SignRequested {
            request,
            vaa_hash,
            signature_id,
        });

        signature_id
    }

    // ── Presigning ──

    /// Request a global presign from the IKA coordinator.
    /// The UnverifiedPresignCap is transferred to the sender (relayer).
    #[allow(lint(self_transfer))]
    public(package) fun request_presign(
        coordinator: &mut DWalletCoordinator,
        enc_key_id: ID,
        request: u64,
        payment_ika: &mut Coin<IKA>,
        payment_sui: &mut Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let session_identifier = random_session_identifier(coordinator, ctx);

        let presign = coordinator.request_global_presign(
            enc_key_id,
            2, // Ed25519 (IKA curve number)
            0, // EdDSA (relative to Ed25519 curve)
            session_identifier,
            payment_ika,
            payment_sui,
            ctx,
        );

        emit(PresignRequested {
            request,
            presign_bcs: bcs::to_bytes(&presign),
        });

        transfer::public_transfer(presign, ctx.sender());
    }

    // ── Admin Migration ──

    /// Update the signing parameters (curve, signature algorithm, hash scheme).
    /// Called by orchestrator after an upgrade to fix incorrect values.
    public(package) fun update_params(
        state: &mut SigningState,
        curve: u32,
        signature_algorithm: u32,
        hash_scheme: u32,
    ) {
        state.curve = curve;
        state.signature_algorithm = signature_algorithm;
        state.hash_scheme = hash_scheme;
    }

    /// Reset the minting cap (e.g. after a rejected DKG).
    /// The old DWalletCap is transferred to the sender for disposal.
    public(package) fun reset_minting_cap(
        state: &mut SigningState,
        ctx: &mut TxContext,
    ) {
        if (state.minting_cap.is_some()) {
            let cap = state.minting_cap.extract();
            transfer::public_transfer(cap, ctx.sender());
        };
    }

    // ── Accessors ──

    public fun signature_algorithm(state: &SigningState): u32 {
        state.signature_algorithm
    }

    public fun hash_scheme(state: &SigningState): u32 {
        state.hash_scheme
    }

    public fun curve(state: &SigningState): u32 {
        state.curve
    }

    public fun has_minting_cap(state: &SigningState): bool {
        state.minting_cap.is_some()
    }

    // ── Private ──

    fun random_session_identifier(
        coordinator: &mut DWalletCoordinator,
        ctx: &mut TxContext,
    ): SessionIdentifier {
        coordinator.register_session_identifier(
            ctx.fresh_object_address().to_bytes(),
            ctx,
        )
    }
}
