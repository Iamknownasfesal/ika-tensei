/// Permissionless test NFT for Ika Tensei faucet.
/// Anyone can mint — testnet only.
module ika_nft::test_nft {
    use std::string::{Self, String};
    use sui::display;
    use sui::package;

    /// The test NFT object.
    public struct TestNFT has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: String,
        number: u64,
    }

    /// One-time witness for Display setup
    public struct TEST_NFT has drop {}

    /// Global counter for auto-incrementing token numbers
    public struct MintCounter has key {
        id: UID,
        count: u64,
    }

    fun init(otw: TEST_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        let mut disp = display::new<TestNFT>(&publisher, ctx);
        display::add(&mut disp, string::utf8(b"name"), string::utf8(b"{name}"));
        display::add(&mut disp, string::utf8(b"description"), string::utf8(b"{description}"));
        display::add(&mut disp, string::utf8(b"image_url"), string::utf8(b"{image_url}"));
        display::add(&mut disp, string::utf8(b"number"), string::utf8(b"{number}"));
        display::add(&mut disp, string::utf8(b"project_url"), string::utf8(b"https://ikatensei.xyz"));
        display::update_version(&mut disp);

        let counter = MintCounter { id: object::new(ctx), count: 0 };

        sui::transfer::public_transfer(publisher, tx_context::sender(ctx));
        sui::transfer::public_transfer(disp, tx_context::sender(ctx));
        sui::transfer::share_object(counter);
    }

    /// Permissionless mint — anyone can call. Testnet faucet.
    public entry fun mint_free(
        counter: &mut MintCounter,
        ctx: &mut TxContext,
    ) {
        counter.count = counter.count + 1;
        let nft = TestNFT {
            id: object::new(ctx),
            name: string::utf8(b"Ika Test NFT"),
            description: string::utf8(b"A test artifact for the Ika Tensei ritual. Testnet only."),
            image_url: string::utf8(b"https://placehold.co/400x400/1a0a2e/ffd700?text=IKA+TEST"),
            number: counter.count,
        };
        sui::transfer::public_transfer(nft, tx_context::sender(ctx));
    }
}
