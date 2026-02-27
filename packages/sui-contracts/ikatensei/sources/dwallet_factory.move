// Ika Tensei - dWallet Factory
//
// Creates shared dWallets via the IKA 2PC-MPC coordinator.
//
// "Shared" means the user's secret key share is stored publicly on-chain,
// allowing the IKA network to derive the full signing key without the user's
// active participation. This is appropriate for relayer-managed deposit dWallets
// where the relayer handles all signing.
//
// Usage (from TypeScript relayer):
//   1. Prepare DKG inputs via @ika.xyz/sdk WASM (prepareDKGAsync)
//   2. Build a PTB calling create_shared_dwallet()
//   3. Poll IKA for dWallet Active state
//   4. Extract pubkey from dWallet output
//   5. Register in dwallet_registry

module ikatensei::dwallet_factory {
    use sui::coin::Coin;
    use sui::sui::SUI;

    use ika::ika::IKA;
    use ika_dwallet_2pc_mpc::coordinator::{
        Self as coordinator,
        DWalletCoordinator,
    };
    use ika_dwallet_2pc_mpc::coordinator_inner::DWalletCap;

    use ikatensei::treasury::Treasury;

    /// Create a shared dWallet via IKA distributed key generation.
    ///
    /// Wraps the IKA coordinator's `request_dwallet_dkg_with_public_user_secret_key_share`.
    /// The user's secret key share is stored publicly on the network (shared mode).
    ///
    /// Returns the DWalletCap which grants control over the new dWallet.
    /// The caller should transfer it to their address or store it.
    ///
    /// Parameters (all crypto data comes from @ika.xyz/sdk prepareDKGAsync):
    ///   - coordinator: the IKA DWalletCoordinator shared object
    ///   - dwallet_network_encryption_key_id: ID of the network encryption key
    ///   - curve: elliptic curve (0 = secp256k1, 1 = secp256r1, 2 = ed25519, 3 = ristretto)
    ///   - centralized_public_key_share_and_proof: from dkgRequestInput.userDKGMessage
    ///   - user_public_output: from dkgRequestInput.userPublicOutput
    ///   - public_user_secret_key_share: from dkgRequestInput.userSecretKeyShare
    ///   - session_bytes: 32 random bytes for session identifier
    ///   - payment_ika: IKA coin for protocol fees
    ///   - payment_sui: SUI coin for gas
    public fun create_shared_dwallet(
        coordinator: &mut DWalletCoordinator,
        dwallet_network_encryption_key_id: ID,
        curve: u32,
        centralized_public_key_share_and_proof: vector<u8>,
        user_public_output: vector<u8>,
        public_user_secret_key_share: vector<u8>,
        session_bytes: vector<u8>,
        payment_ika: &mut Coin<IKA>,
        payment_sui: &mut Coin<SUI>,
        ctx: &mut TxContext,
    ): DWalletCap {
        // Register a unique session identifier for this DKG request
        let session_identifier = coordinator::register_session_identifier(
            coordinator,
            session_bytes,
            ctx,
        );

        // Request shared dWallet creation via DKG
        let (dwallet_cap, _sign_id) = coordinator::request_dwallet_dkg_with_public_user_secret_key_share(
            coordinator,
            dwallet_network_encryption_key_id,
            curve,
            centralized_public_key_share_and_proof,
            user_public_output,
            public_user_secret_key_share,
            std::option::none(), // no signing during DKG
            session_identifier,
            payment_ika,
            payment_sui,
            ctx,
        );

        dwallet_cap
    }

    /// Treasury-funded variant. Withdraws IKA/SUI from the treasury,
    /// performs DKG, then returns unused coins back to the treasury.
    /// Use this for the minting dWallet creation (admin-funded).
    public fun create_shared_dwallet_with_treasury(
        treasury: &mut Treasury,
        coordinator: &mut DWalletCoordinator,
        dwallet_network_encryption_key_id: ID,
        curve: u32,
        centralized_public_key_share_and_proof: vector<u8>,
        user_public_output: vector<u8>,
        public_user_secret_key_share: vector<u8>,
        session_bytes: vector<u8>,
        ctx: &mut TxContext,
    ): DWalletCap {
        let (mut payment_ika, mut payment_sui) = treasury.withdraw_coins(ctx);

        let session_identifier = coordinator::register_session_identifier(
            coordinator,
            session_bytes,
            ctx,
        );

        let (dwallet_cap, _sign_id) = coordinator::request_dwallet_dkg_with_public_user_secret_key_share(
            coordinator,
            dwallet_network_encryption_key_id,
            curve,
            centralized_public_key_share_and_proof,
            user_public_output,
            public_user_secret_key_share,
            std::option::none(),
            session_identifier,
            &mut payment_ika,
            &mut payment_sui,
            ctx,
        );

        treasury.return_coins(payment_ika, payment_sui);
        dwallet_cap
    }
}
