/// Testnet Popkins-style NFT with randomized traits.
/// Mimics the Claynosaurz Popkins structure for bridge testing.
#[allow(implicit_const_copy, untyped_literal)]
module popkins::popkins_nft {
    use std::string::{Self, String};
    use sui::display;
    use sui::package;
    use sui::vec_map::{Self, VecMap};

    // ─── Trait pools ────────────────────────────────────────────────────

    const SPECIES: vector<vector<u8>> = vector[
        b"Diplox", b"Rex", b"Stego", b"Raptor", b"Bronto",
        b"Ptero", b"Trice", b"Ankylo", b"Spino", b"Pachy",
    ];

    const MUTATIONS: vector<vector<u8>> = vector[
        b"Alpha", b"Beta", b"Gamma", b"Delta", b"Omega",
        b"Sigma", b"Theta", b"Zeta", b"Epsilon", b"Lambda",
    ];

    const SKINS: vector<vector<u8>> = vector[
        b"Goana", b"Scales", b"Crystal", b"Magma", b"Frost",
        b"Neon", b"Shadow", b"Jungle", b"Desert", b"Ocean",
    ];

    const COLORS: vector<vector<u8>> = vector[
        b"Tropic", b"Midnight", b"Solar", b"Crimson", b"Violet",
        b"Emerald", b"Amber", b"Cobalt", b"Coral", b"Obsidian",
    ];

    const BACKGROUNDS: vector<vector<u8>> = vector[
        b"Salmon", b"Void", b"Aurora", b"Sunset", b"Storm",
        b"Lavender", b"Mint", b"Dusk", b"Ember", b"Ice",
    ];

    const SHAPES: vector<vector<u8>> = vector[
        b"Long", b"Round", b"Spiky", b"Slim", b"Stocky",
    ];

    // ─── Types ──────────────────────────────────────────────────────────

    /// The Popkins NFT — mirrors mainnet structure.
    public struct Popkins has key, store {
        id: UID,
        name: String,
        number: u64,
        description: String,
        image_url: String,
        avatar_url: String,
        avatar_thumb_url: String,
        creator: String,
        project_url: String,
        link: String,
        key: String,
        attributes: VecMap<String, String>,
    }

    /// One-time witness for Display setup.
    public struct POPKINS_NFT has drop {}

    /// Shared counter for sequential numbering + pseudo-RNG seed.
    public struct MintCounter has key {
        id: UID,
        count: u64,
    }

    // ─── Init ───────────────────────────────────────────────────────────

    fun init(otw: POPKINS_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);

        let mut disp = display::new<Popkins>(&publisher, ctx);
        display::add(&mut disp, string::utf8(b"name"), string::utf8(b"{name} #{number}"));
        display::add(&mut disp, string::utf8(b"description"), string::utf8(b"{description}"));
        display::add(&mut disp, string::utf8(b"image_url"), string::utf8(b"https://storage.claynosaurz.com/popkins/images/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"));
        display::add(&mut disp, string::utf8(b"avatar_url"), string::utf8(b"https://storage.claynosaurz.com/popkins/avatars/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"));
        display::add(&mut disp, string::utf8(b"avatar_thumb_url"), string::utf8(b"https://storage.claynosaurz.com/popkins/avatars-thumb/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"));
        display::add(&mut disp, string::utf8(b"creator"), string::utf8(b"{creator}"));
        display::add(&mut disp, string::utf8(b"project_url"), string::utf8(b"{project_url}"));
        display::add(&mut disp, string::utf8(b"link"), string::utf8(b"{link}"));
        display::add(&mut disp, string::utf8(b"attributes"), string::utf8(b"{attributes}"));
        display::update_version(&mut disp);

        let counter = MintCounter { id: object::new(ctx), count: 0 };

        sui::transfer::public_transfer(publisher, ctx.sender());
        sui::transfer::public_transfer(disp, ctx.sender());
        sui::transfer::share_object(counter);
    }

    // ─── Mint ───────────────────────────────────────────────────────────

    /// Permissionless mint with pseudo-random traits. Testnet only.
    public fun mint_free(
        counter: &mut MintCounter,
        ctx: &mut TxContext,
    ) {
        counter.count = counter.count + 1;
        let n = counter.count;
        let seed = derive_seed(n, ctx);

        // Pick traits
        let species = pick(&SPECIES, seed, 0);
        let mutation = pick(&MUTATIONS, seed, 1);
        let skin = pick(&SKINS, seed, 2);
        let color = pick(&COLORS, seed, 3);
        let background = pick(&BACKGROUNDS, seed, 4);
        let shape = pick(&SHAPES, seed, 5);

        // Build attributes map
        let mut attrs = vec_map::empty<String, String>();
        vec_map::insert(&mut attrs, string::utf8(b"Species"), string::utf8(species));
        vec_map::insert(&mut attrs, string::utf8(b"Mutation"), string::utf8(mutation));
        vec_map::insert(&mut attrs, string::utf8(b"Skin"), string::utf8(skin));
        vec_map::insert(&mut attrs, string::utf8(b"Color"), string::utf8(color));
        vec_map::insert(&mut attrs, string::utf8(b"Background"), string::utf8(background));
        vec_map::insert(&mut attrs, string::utf8(b"Shape"), string::utf8(shape));

        let nft = Popkins {
            id: object::new(ctx),
            name: string::utf8(b"Popkins"),
            number: n,
            description: string::utf8(
                b"Who knew so much chaos could come in such a small package? Popkins are an expansive collection of 25,000 joyful, mischievous critters inhabiting the Claynosaurz Universe."
            ),
            image_url: string::utf8(b"https://storage.claynosaurz.com/popkins/images/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"),
            avatar_url: string::utf8(b"https://storage.claynosaurz.com/popkins/avatars/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"),
            avatar_thumb_url: string::utf8(b"https://storage.claynosaurz.com/popkins/avatars-thumb/0x222a20bd7142d4e06d458c1b08da9a06c23241d8f9f09d57f2849ba9c4ecca3a"),
            creator: string::utf8(b"Claynosaurz"),
            project_url: string::utf8(b"https://claynosaurz.com"),
            link: string::utf8(b"https://popkins.com"),
            key: build_key(n, seed),
            attributes: attrs,
        };

        sui::transfer::public_transfer(nft, ctx.sender());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /// Overflow-safe pseudo-RNG seed from count + epoch.
    fun derive_seed(n: u64, ctx: &TxContext): u64 {
        let epoch = ctx.epoch();
        (n ^ (epoch << 16)) ^ ((n << 32) | epoch)
    }

    /// Pick an element from a trait pool using seed + offset.
    fun pick(pool: &vector<vector<u8>>, seed: u64, offset: u64): vector<u8> {
        let mixed = seed ^ (offset << 13) ^ (offset << 7);
        let idx = (mixed % (vector::length(pool) as u64));
        *vector::borrow(pool, (idx as u64))
    }

    /// Build a unique key string like "pop_42_a7b3".
    fun build_key(n: u64, seed: u64): String {
        let mut key = string::utf8(b"pop_");
        string::append(&mut key, u64_to_string(n));
        string::append(&mut key, string::utf8(b"_"));
        let hex_chars: vector<u8> = b"0123456789abcdef";
        let mut hex = vector::empty<u8>();
        let mut s = seed;
        let mut i = 0;
        while (i < 4) {
            vector::push_back(&mut hex, *vector::borrow(&hex_chars, ((s % 16) as u64)));
            s = s / 16;
            i = i + 1;
        };
        string::append(&mut key, string::utf8(hex));
        key
    }

    fun u64_to_string(mut n: u64): String {
        if (n == 0) return string::utf8(b"0");
        let mut bytes = vector::empty<u8>();
        while (n > 0) {
            vector::push_back(&mut bytes, ((48 + n % 10) as u8));
            n = n / 10;
        };
        vector::reverse(&mut bytes);
        string::utf8(bytes)
    }
}
