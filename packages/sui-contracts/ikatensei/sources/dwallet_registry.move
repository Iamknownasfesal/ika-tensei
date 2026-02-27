// Ika Tensei - DWallet Registry
//
// Stores deposit dWallets (both metadata and actual DWalletCap objects).
// Each deposit dWallet is one-use: one dWallet = one NFT seal.
//
// The relayer creates deposit dWallets via dwallet_factory, then registers
// them here. The DWalletCap is stored in the registry — not in the relayer's
// wallet — so the contract controls all deposit dWallet caps.
//
// The minting dWallet (used for signing) is separate and lives in SigningState.
//
// Lifecycle: registered (active) → used (permanent, after seal completion)

module ikatensei::dwallet_registry {
    use sui::table::{Self, Table};
    use sui::event::emit;
    use std::bcs;

    use ika_dwallet_2pc_mpc::coordinator_inner::DWalletCap;

    // Error codes
    const E_NOT_REGISTERED: u64 = 1;
    const E_ALREADY_REGISTERED: u64 = 2;
    const E_ZERO_ADDRESS: u64 = 4;
    const E_ALREADY_ACTIVE: u64 = 5;
    const E_ALREADY_USED: u64 = 6;

    // ==================================================================
    // Events
    // ==================================================================

    public struct DWalletRegistered has copy, drop {
        deposit_address: vector<u8>,
        dwallet_id: vector<u8>,
        owner: address,
        timestamp: u64,
    }

    public struct DWalletUnregistered has copy, drop {
        deposit_address: vector<u8>,
        timestamp: u64,
    }

    public struct DWalletReactivated has copy, drop {
        deposit_address: vector<u8>,
        timestamp: u64,
    }

    public struct OwnershipTransferred has copy, drop {
        old_owner: address,
        new_owner: address,
        timestamp: u64,
    }

    public struct DWalletUsed has copy, drop {
        deposit_address: vector<u8>,
        timestamp: u64,
    }

    // ==================================================================
    // Data Structures
    // ==================================================================

    /// Per-dWallet metadata record.
    public struct DWalletRecord has store, copy, drop {
        deposit_address: vector<u8>,
        dwallet_id: vector<u8>,
        dwallet_pubkey: vector<u8>,
        owner: address,
        registered_at: u64,
        active: bool,
        used: bool,
    }

    /// Admin capability — controls who can mutate the registry.
    public struct RegistryOwnerCap has key, store {
        id: UID,
    }

    /// Main registry — shared object.
    /// Stores both metadata records and the actual DWalletCap objects.
    public struct DWalletRegistry has key {
        id: UID,
        owner: address,
        /// deposit_address -> metadata record
        wallets: Table<vector<u8>, DWalletRecord>,
        /// deposit_address -> actual DWalletCap (contract-controlled)
        dwallet_caps: Table<vector<u8>, DWalletCap>,
        /// dwallet_id bytes -> deposit_address (reverse lookup)
        dwallet_ids: Table<vector<u8>, vector<u8>>,
        total_registered: u64,
        total_active: u64,
    }

    // ==================================================================
    // Init
    // ==================================================================

    fun init(ctx: &mut TxContext) {
        let owner = sui::tx_context::sender(ctx);

        let cap = RegistryOwnerCap {
            id: object::new(ctx),
        };

        let registry = DWalletRegistry {
            id: object::new(ctx),
            owner,
            wallets: table::new(ctx),
            dwallet_caps: table::new(ctx),
            dwallet_ids: table::new(ctx),
            total_registered: 0,
            total_active: 0,
        };

        sui::transfer::share_object(registry);
        sui::transfer::public_transfer(cap, owner);
    }

    // ==================================================================
    // Registration
    // ==================================================================

    /// Register a new deposit dWallet.
    /// The DWalletCap is consumed and stored in the registry — the relayer
    /// gives up ownership and the contract holds the cap permanently.
    /// dwallet_id is derived from the cap (not passed separately).
    public fun register_dwallet(
        registry: &mut DWalletRegistry,
        _cap: &RegistryOwnerCap,
        deposit_address: vector<u8>,
        dwallet_pubkey: vector<u8>,
        dwallet_cap: DWalletCap,
        ctx: &mut TxContext,
    ) {
        // Accept variable-length: 20 bytes (EVM) or 32 bytes (Ed25519/Solana/NEAR)
        let addr_len = vector::length(&deposit_address);
        assert!(addr_len == 20 || addr_len == 32, E_ZERO_ADDRESS);
        // Accept variable-length: 32 bytes (Ed25519) or 33 bytes (compressed secp256k1)
        let pk_len = vector::length(&dwallet_pubkey);
        assert!(pk_len == 32 || pk_len == 33, E_ZERO_ADDRESS);
        assert!(
            !table::contains(&registry.wallets, deposit_address),
            E_ALREADY_REGISTERED
        );

        let dwallet_id = object::id_to_bytes(&dwallet_cap.dwallet_id());
        let owner = sui::tx_context::sender(ctx);
        let timestamp = sui::tx_context::epoch(ctx);

        let record = DWalletRecord {
            deposit_address,
            dwallet_id,
            dwallet_pubkey,
            owner,
            registered_at: timestamp,
            active: true,
            used: false,
        };

        // Store the actual DWalletCap — contract controls it from now on
        table::add(&mut registry.dwallet_caps, deposit_address, dwallet_cap);
        table::add(&mut registry.wallets, deposit_address, record);
        table::add(&mut registry.dwallet_ids, dwallet_id, deposit_address);

        registry.total_registered = registry.total_registered + 1;
        registry.total_active = registry.total_active + 1;

        emit(DWalletRegistered {
            deposit_address,
            dwallet_id,
            owner,
            timestamp,
        });
    }

    // ==================================================================
    // Lifecycle
    // ==================================================================

    /// Deactivate (soft-delete) a dWallet registration.
    /// The DWalletCap stays in the registry (not returned).
    public fun unregister_dwallet(
        registry: &mut DWalletRegistry,
        _cap: &RegistryOwnerCap,
        deposit_address: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(
            table::contains(&registry.wallets, deposit_address),
            E_NOT_REGISTERED
        );

        let record = table::borrow_mut(&mut registry.wallets, deposit_address);
        if (record.active) {
            registry.total_active = registry.total_active - 1;
        };
        record.active = false;

        emit(DWalletUnregistered {
            deposit_address,
            timestamp: sui::tx_context::epoch(ctx),
        });
    }

    /// Re-activate a previously deactivated dWallet.
    /// Cannot reactivate a dWallet that has been permanently marked as used.
    public fun reactivate_dwallet(
        registry: &mut DWalletRegistry,
        _cap: &RegistryOwnerCap,
        deposit_address: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(
            table::contains(&registry.wallets, deposit_address),
            E_NOT_REGISTERED
        );

        let record = table::borrow_mut(&mut registry.wallets, deposit_address);
        assert!(!record.used, E_ALREADY_USED);
        assert!(!record.active, E_ALREADY_ACTIVE);
        record.active = true;
        registry.total_active = registry.total_active + 1;

        emit(DWalletReactivated {
            deposit_address,
            timestamp: sui::tx_context::epoch(ctx),
        });
    }

    /// Permanently mark a dWallet as used after seal completion.
    /// One dWallet = one NFT. The DWalletCap stays in the registry.
    /// public(package) — only callable by orchestrator.
    public(package) fun mark_dwallet_used(
        registry: &mut DWalletRegistry,
        deposit_address: &vector<u8>,
    ) {
        assert!(
            table::contains(&registry.wallets, *deposit_address),
            E_NOT_REGISTERED
        );

        let record = table::borrow_mut(&mut registry.wallets, *deposit_address);
        assert!(!record.used, E_ALREADY_USED);

        if (record.active) {
            registry.total_active = registry.total_active - 1;
        };

        record.used = true;
        record.active = false;

        emit(DWalletUsed {
            deposit_address: *deposit_address,
            timestamp: 0,
        });
    }

    /// Transfer registry ownership to a new address.
    public fun transfer_ownership(
        registry: &mut DWalletRegistry,
        _cap: &RegistryOwnerCap,
        new_owner: address,
        ctx: &mut TxContext,
    ) {
        let old_owner = registry.owner;
        registry.owner = new_owner;
        emit(OwnershipTransferred {
            old_owner,
            new_owner,
            timestamp: sui::tx_context::epoch(ctx),
        });
    }

    // ==================================================================
    // View functions
    // ==================================================================

    public fun is_registered(registry: &DWalletRegistry, deposit_address: &vector<u8>): bool {
        if (!table::contains(&registry.wallets, *deposit_address)) {
            return false
        };
        table::borrow(&registry.wallets, *deposit_address).active
    }

    /// Check if a record exists at all (regardless of active/used status).
    /// Used by orchestrator to conditionally skip registry marking for centralized seals.
    public fun has_record(registry: &DWalletRegistry, deposit_address: &vector<u8>): bool {
        table::contains(&registry.wallets, *deposit_address)
    }

    public fun is_dwallet_used(registry: &DWalletRegistry, deposit_address: &vector<u8>): bool {
        if (!table::contains(&registry.wallets, *deposit_address)) {
            return false
        };
        table::borrow(&registry.wallets, *deposit_address).used
    }

    public fun is_dwallet_registered(registry: &DWalletRegistry, dwallet_id: &vector<u8>): bool {
        table::contains(&registry.dwallet_ids, *dwallet_id)
    }

    public fun get_deposit_address(
        registry: &DWalletRegistry,
        dwallet_id: &vector<u8>,
    ): vector<u8> {
        assert!(table::contains(&registry.dwallet_ids, *dwallet_id), E_NOT_REGISTERED);
        *table::borrow(&registry.dwallet_ids, *dwallet_id)
    }

    public fun get_record(
        registry: &DWalletRegistry,
        deposit_address: &vector<u8>,
    ): DWalletRecord {
        assert!(table::contains(&registry.wallets, *deposit_address), E_NOT_REGISTERED);
        *table::borrow(&registry.wallets, *deposit_address)
    }

    public fun get_owner(registry: &DWalletRegistry, deposit_address: &vector<u8>): address {
        table::borrow(&registry.wallets, *deposit_address).owner
    }

    public fun get_dwallet_id(registry: &DWalletRegistry, deposit_address: &vector<u8>): vector<u8> {
        table::borrow(&registry.wallets, *deposit_address).dwallet_id
    }

    public fun get_dwallet_pubkey(registry: &DWalletRegistry, deposit_address: &vector<u8>): vector<u8> {
        table::borrow(&registry.wallets, *deposit_address).dwallet_pubkey
    }

    public fun has_dwallet_cap(registry: &DWalletRegistry, deposit_address: &vector<u8>): bool {
        table::contains(&registry.dwallet_caps, *deposit_address)
    }

    public fun total_registered(registry: &DWalletRegistry): u64 {
        registry.total_registered
    }

    public fun total_active(registry: &DWalletRegistry): u64 {
        registry.total_active
    }

    public fun get_owner_address(registry: &DWalletRegistry): address {
        registry.owner
    }

    public fun is_owner(registry: &DWalletRegistry, addr: address): bool {
        addr == registry.owner
    }

    // ==================================================================
    // DWalletRecord accessors
    // ==================================================================

    public fun record_deposit_address(r: &DWalletRecord): &vector<u8> { &r.deposit_address }
    public fun record_dwallet_id(r: &DWalletRecord): &vector<u8> { &r.dwallet_id }
    public fun record_owner(r: &DWalletRecord): address { r.owner }
    public fun record_registered_at(r: &DWalletRecord): u64 { r.registered_at }
    public fun record_active(r: &DWalletRecord): bool { r.active }
    public fun record_used(r: &DWalletRecord): bool { r.used }

    // ==================================================================
    // Utility
    // ==================================================================

    public fun address_to_bytes(addr: address): vector<u8> {
        bcs::to_bytes(&addr)
    }
}
