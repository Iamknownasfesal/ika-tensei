module ikatensei::orchestrator_tests {
    use ikatensei::orchestrator;

    #[test]
    fun test_verify_signature_invalid_returns_false() {
        let pubkey = x"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
        let message = x"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        // 64-byte signature that doesn't match — real Ed25519 verify returns false
        let signature = x"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40";

        let result = orchestrator::verify_signature(&pubkey, &message, &signature);
        assert!(result == false, 0);
    }

    #[test]
    fun test_verify_signature_wrong_length() {
        let pubkey = x"0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
        let message = x"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
        // Short signature — rejected before Ed25519 check
        let signature = x"010203";

        let result = orchestrator::verify_signature(&pubkey, &message, &signature);
        assert!(result == false, 0);
    }
}
