#[test_only]
module ika_tensei_aptos::seal_initiator_tests {
    use ika_tensei_aptos::seal_initiator;
    use std::vector;

    #[test]
    /// Test payload encoding produces correct wire format
    fun test_build_payload_wire_format() {
        let creator = @0xAABB;
        let token_addr = @0x1234;
        let deposit_addr = @0x5678;
        let receiver = vector[
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
            0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
            0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x20,
        ];
        let uri = b"ipfs://QmTest123";

        let payload = seal_initiator::build_payload_for_test(
            creator, token_addr, deposit_addr, receiver, uri,
        );

        // Verify byte 0 = 0x01 (payload type)
        assert!(*vector::borrow(&payload, 0) == 1, 0);

        // Verify bytes 1-2 = 0x0016 (chain 22 big-endian)
        assert!(*vector::borrow(&payload, 1) == 0, 1);
        assert!(*vector::borrow(&payload, 2) == 22, 2);

        // Verify total length = 131 + len(uri)
        let expected_len = 131 + vector::length(&uri);
        assert!(vector::length(&payload) == expected_len, 3);

        // Verify receiver at offset 99
        assert!(*vector::borrow(&payload, 99) == 0x01, 4);
        assert!(*vector::borrow(&payload, 130) == 0x20, 5);

        // Verify token_uri starts at offset 131
        // "ipfs://QmTest123" starts with 'i' = 0x69
        assert!(*vector::borrow(&payload, 131) == 0x69, 6);
    }

    #[test]
    /// Test payload with empty URI (minimum payload size)
    fun test_build_payload_empty_uri() {
        let creator = @0x1;
        let token_addr = @0x2;
        let deposit_addr = @0x3;
        let receiver = vector[
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let uri = vector::empty<u8>();

        let payload = seal_initiator::build_payload_for_test(
            creator, token_addr, deposit_addr, receiver, uri,
        );

        // Minimum payload is 131 bytes
        assert!(vector::length(&payload) == 131, 0);
    }

    #[test]
    /// Test chain ID view function returns u16
    fun test_get_chain_id() {
        assert!(seal_initiator::get_chain_id() == 22u16, 0);
    }
}
