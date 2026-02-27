/// Kiosk Helper — Extracts NFTs from Sui Kiosks for bridging.
///
/// Purchases an NFT from a user's kiosk at price 0 and returns
/// both the NFT object and the TransferRequest for the caller
/// to resolve policy rules and handle custody.
///
/// Usage in PTB:
///   1. Call `extract_from_kiosk<T>()` → returns (T, TransferRequest<T>)
///   2. Resolve any TransferPolicy rules (e.g., `royalty_rule::pay()`)
///   3. Call `transfer_policy::confirm_request(policy, request)`
///   4. Create a new kiosk, place NFT, transfer kiosk to deposit address
///      — or `transfer::public_transfer(nft, deposit_address)`
module ikatensei::kiosk_helper {
    use sui::kiosk::{Self, Kiosk, KioskOwnerCap};
    use sui::transfer_policy::TransferRequest;
    use sui::coin;
    use sui::sui::SUI;

    /// Extract an NFT from a kiosk by listing at price 0 and purchasing.
    /// Returns the NFT and the TransferRequest for the caller to resolve.
    public fun extract_from_kiosk<T: key + store>(
        kiosk: &mut Kiosk,
        cap: &KioskOwnerCap,
        item_id: object::ID,
        ctx: &mut TxContext,
    ): (T, TransferRequest<T>) {
        // List at price 0
        kiosk::list<T>(kiosk, cap, item_id, 0);

        // Purchase with zero coin
        let purchase_coin = coin::zero<SUI>(ctx);
        kiosk::purchase<T>(kiosk, item_id, purchase_coin)
    }
}
