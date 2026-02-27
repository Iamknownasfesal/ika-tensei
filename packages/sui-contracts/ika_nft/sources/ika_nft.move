/// Simple NFT module for Ika Tensei demo.
/// Mints NFTs with on-chain metadata (name, description, image_url, attributes).
/// Objects have `key + store` so they can be passed to register_seal_native<T>.
module ika_nft::ika_nft {
    use std::string::{Self, String};
    use sui::display;
    use sui::package;

    /// The NFT object. Has key+store for transferability and seal compatibility.
    public struct IkaNFT has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: String,
        /// JSON-encoded attributes string
        attributes: String,
        /// Collection name
        collection: String,
        /// Token number within collection
        number: u64,
    }

    /// One-time witness for Display setup
    public struct IKA_NFT has drop {}

    /// Mint authority
    public struct MintCap has key, store {
        id: UID,
    }

    fun init(otw: IKA_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        // Setup Display template so Suiscan/wallets render the NFT
        let mut disp = display::new<IkaNFT>(&publisher, ctx);
        display::add(&mut disp, string::utf8(b"name"), string::utf8(b"{name}"));
        display::add(&mut disp, string::utf8(b"description"), string::utf8(b"{description}"));
        display::add(&mut disp, string::utf8(b"image_url"), string::utf8(b"{image_url}"));
        display::add(&mut disp, string::utf8(b"collection"), string::utf8(b"{collection}"));
        display::add(&mut disp, string::utf8(b"number"), string::utf8(b"{number}"));
        display::add(&mut disp, string::utf8(b"attributes"), string::utf8(b"{attributes}"));
        display::add(&mut disp, string::utf8(b"project_url"), string::utf8(b"https://ikatensei.xyz"));
        display::update_version(&mut disp);

        let mint_cap = MintCap { id: object::new(ctx) };

        sui::transfer::public_transfer(publisher, tx_context::sender(ctx));
        sui::transfer::public_transfer(disp, tx_context::sender(ctx));
        sui::transfer::public_transfer(mint_cap, tx_context::sender(ctx));
    }

    /// Mint a new NFT. Only MintCap holder can call.
    public fun mint(
        _cap: &MintCap,
        name: String,
        description: String,
        image_url: String,
        attributes: String,
        collection: String,
        number: u64,
        recipient: address,
        ctx: &mut TxContext,
    ): IkaNFT {
        let nft = IkaNFT {
            id: object::new(ctx),
            name,
            description,
            image_url,
            attributes,
            collection,
            number,
        };
        nft
    }

    /// Mint and transfer to recipient in one call
    public entry fun mint_and_transfer(
        cap: &MintCap,
        name: String,
        description: String,
        image_url: String,
        attributes: String,
        collection: String,
        number: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let nft = mint(cap, name, description, image_url, attributes, collection, number, recipient, ctx);
        sui::transfer::public_transfer(nft, recipient);
    }

    // Accessors
    public fun name(nft: &IkaNFT): &String { &nft.name }
    public fun description(nft: &IkaNFT): &String { &nft.description }
    public fun image_url(nft: &IkaNFT): &String { &nft.image_url }
    public fun attributes(nft: &IkaNFT): &String { &nft.attributes }
    public fun collection(nft: &IkaNFT): &String { &nft.collection }
    public fun number(nft: &IkaNFT): u64 { nft.number }
}
