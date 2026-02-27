// Unit tests for payload.move
module ikatensei::payload_tests {
    use ikatensei::payload;

    #[test]
    fun test_construct_signing_message() {
        let token_uri = x"687474703a2f2f6578616d706c652e636f6d2f6e66742f31";
        let token_id = x"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
        let receiver = x"72656365697665725f77616c6c65745f616464726573735f31323334";

        // sha256(token_uri || token_id || receiver) → 32 bytes
        let message = payload::construct_signing_message(&token_uri, &token_id, &receiver);
        assert!(vector::length(&message) == 32, 0);
    }

    #[test]
    fun test_is_supported_chain() {
        assert!(payload::is_supported_chain(2), 0);     // Ethereum
        assert!(payload::is_supported_chain(21), 0);    // Sui
        assert!(payload::is_supported_chain(1), 0);     // Solana
        assert!(!payload::is_supported_chain(9999), 0); // Unknown
    }

    #[test]
    fun test_chain_name() {
        let name = payload::chain_name(2);
        assert!(vector::length(&name) > 0, 0);
        
        let name2 = payload::chain_name(21);
        assert!(vector::length(&name2) > 0, 0);
    }

    #[test]
    fun test_encode_decode_roundtrip() {
        let source_chain = 2u16;
        let nft_contract = x"000000000000000000000000a0aedfe538989ed8b5e96116bf41f3f9c3ea3b20";
        let token_id = x"0000000000000000000000000000000000000000000000000000000000000001";
        let deposit_address = x"000000000000000000000000b47e1c3302d5d1c1c7e5c3b9a0d1c2b3a4d5e6f7";
        let receiver = x"000000000000000000000000cafeb33e7e4b0a3d9c1ff7e8ab2c3d4e5f6a7b8c";
        let token_uri = x"697066733a2f2f516d48617331323334353637383930";
        
        let encoded = payload::encode_seal_payload(
            source_chain,
            nft_contract,
            token_id,
            deposit_address,
            receiver,
            token_uri,
        );
        
        let decoded = payload::decode_seal_payload(&encoded);
        
        assert!(payload::get_source_chain(&decoded) == source_chain, 0);
    }
}
