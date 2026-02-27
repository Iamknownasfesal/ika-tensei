module ikatensei::dwallet_registry_tests {
    use ikatensei::dwallet_registry;

    #[test]
    fun test_address_to_bytes() {
        let addr = @0x123456789ABCDEF;
        let bytes = dwallet_registry::address_to_bytes(addr);
        assert!(vector::length(&bytes) == 32, 0);
    }
}
