// Ika Tensei - Treasury
//
// On-chain IKA/SUI balance pool. Every IKA coordinator call (DKG, presign, sign)
// requires IKA and SUI coin payments. Instead of the relayer passing coins per-tx,
// the treasury holds balances and uses a withdraw → use → return pattern.
//
// Based on infinite_idol::treasury pattern.

module ikatensei::treasury {
    use ika::ika::IKA;
    use sui::{balance::{Self, Balance}, coin::Coin, sui::SUI};

    public struct Treasury has store {
        ika_balance: Balance<IKA>,
        sui_balance: Balance<SUI>,
    }

    public(package) fun new(): Treasury {
        Treasury {
            ika_balance: balance::zero(),
            sui_balance: balance::zero(),
        }
    }

    public(package) fun add_ika(self: &mut Treasury, payment: Coin<IKA>) {
        self.ika_balance.join(payment.into_balance());
    }

    public(package) fun add_sui(self: &mut Treasury, payment: Coin<SUI>) {
        self.sui_balance.join(payment.into_balance());
    }

    /// Withdraw all IKA and SUI as coins for use in coordinator calls.
    /// The caller MUST return unused coins via return_coins().
    public(package) fun withdraw_coins(
        self: &mut Treasury,
        ctx: &mut TxContext,
    ): (Coin<IKA>, Coin<SUI>) {
        let ika = self.ika_balance.withdraw_all().into_coin(ctx);
        let sui = self.sui_balance.withdraw_all().into_coin(ctx);
        (ika, sui)
    }

    /// Return unused coins after a coordinator call.
    public(package) fun return_coins(
        self: &mut Treasury,
        ika: Coin<IKA>,
        sui: Coin<SUI>,
    ) {
        self.ika_balance.join(ika.into_balance());
        self.sui_balance.join(sui.into_balance());
    }

    public(package) fun ika_balance(self: &Treasury): u64 {
        self.ika_balance.value()
    }

    public(package) fun sui_balance(self: &Treasury): u64 {
        self.sui_balance.value()
    }
}
