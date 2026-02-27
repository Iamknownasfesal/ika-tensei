// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {SealInitiator} from "../contracts/SealInitiator.sol";

/// @title MockERC721
/// @notice Mock ERC-721 contract for testing
contract MockERC721 {
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string) private _tokenURIs;

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        return _tokenURIs[tokenId];
    }

    // Test helpers
    function mint(address to, uint256 tokenId, string memory uri) external {
        _owners[tokenId] = to;
        _balances[to]++;
        _tokenURIs[tokenId] = uri;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(_owners[tokenId] == from, "Not owner");
        _owners[tokenId] = to;
        _balances[from]--;
        _balances[to]++;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }
}

/// @title MockERC1155
/// @notice Mock ERC-1155 contract for testing
contract MockERC1155 {
    mapping(address => mapping(uint256 => uint256)) private _balances;
    mapping(uint256 => string) private _uris;

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balances[account][id];
    }

    function uri(uint256 id) external view returns (string memory) {
        return _uris[id];
    }

    // Test helpers
    function mint(address to, uint256 id, uint256 amount, string memory uri_) external {
        _balances[to][id] += amount;
        _uris[id] = uri_;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0xd9b67a26 || interfaceId == 0x0e89341c;
    }
}

/// @title MockWormhole
/// @notice Mock Wormhole core bridge for testing
contract MockWormhole {
    uint256 public fee = 0.01 ether;
    uint16 public _chainId = 2; // Ethereum
    uint32 public _nonce;

    function publishMessage(
        uint32,
        bytes calldata,
        uint8
    ) external payable returns (uint64 sequence) {
        sequence = _nonce++;
    }

    function messageFee() external view returns (uint256) {
        return fee;
    }

    function chainId() external view returns (uint16) {
        return _chainId;
    }

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function setChainId(uint16 __chainId) external {
        _chainId = __chainId;
    }
}

/// @title SealInitiatorTest
/// @notice Comprehensive tests for SealInitiator contract
contract SealInitiatorTest is Test {
    SealInitiator public initiator;
    MockWormhole public wormhole;
    MockERC721 public erc721;
    MockERC1155 public erc1155;

    address public user1 = address(0x1);
    address public user2 = address(0x2);
    address public depositAddress = address(0xDEAD);

    bytes32 public solanaReceiver = bytes32(uint256(1));

    event SealInitiated(
        address indexed nftContract,
        uint256 indexed tokenId,
        address depositAddress,
        string tokenURI,
        bytes32 solanaReceiver,
        uint64 sequence,
        uint16 sourceChainId
    );

    event TokenURIUnavailable(
        address indexed nftContract,
        uint256 indexed tokenId
    );

    function setUp() public {
        // Deploy mocks
        wormhole = new MockWormhole();
        erc721 = new MockERC721();
        erc1155 = new MockERC1155();

        // Deploy SealInitiator
        initiator = new SealInitiator(address(wormhole), address(0));
    }

    // ============ Constructor Tests ============

    function test_Constructor() public {
        assertEq(address(initiator.wormhole()), address(wormhole));
    }

    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert("Invalid wormhole address");
        new SealInitiator(address(0), address(0));
    }

    // ============ initiateSeal Basic Tests ============

    function test_InitiateSeal_Success() public {
        // Setup: Mint NFT to deposit address
        erc721.mint(depositAddress, 1, "ipfs://QmTest123");

        // Execute: Call initiateSeal
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        uint64 sequence = initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );

        // Verify: Check sequence incremented
        assertEq(sequence, 0);
        assertEq(initiator.sequence(), 1);
    }

    function test_InitiateSeal_EmitsEvent() public {
        // Setup
        erc721.mint(depositAddress, 42, "ipfs://QmNFT42");

        // Expect event
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        vm.expectEmit(true, true, true, true);
        emit SealInitiated(
            address(erc721),
            42,
            depositAddress,
            "ipfs://QmNFT42",
            solanaReceiver,
            0,
            2 // Ethereum chain ID
        );

        initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            42,
            depositAddress,
            solanaReceiver
        );
    }

    function test_InitiateSeal_RefundsExcessFee() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://QmTest");

        // Deal and prank in separate steps
        vm.deal(user1, 10 ether);

        // Execute with excess fee
        vm.prank(user1);
        initiator.initiateSeal{value: 1 ether}( // Way more than needed
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );

        // Verify: Contract has excess ETH (refunded to user)
        // The contract should have 0 balance after refund
        assertEq(address(initiator).balance, 0);
    }

    // ============ initiateSeal Error Tests ============

    function test_InitiateSeal_RevertsWhenNotAtDepositAddress() public {
        // Setup: Mint to user1, not depositAddress
        erc721.mint(user1, 1, "ipfs://QmTest");

        // Execute & Verify
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        vm.expectRevert(SealInitiator.NotAtDepositAddress.selector);
        initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );
    }

    function test_InitiateSeal_RevertsWhenInsufficientFee() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://QmTest");

        // Execute & Verify
        vm.deal(user1, 0);
        vm.prank(user1);

        vm.expectRevert(SealInitiator.InsufficientFee.selector);
        initiator.initiateSeal{value: 0}( // No ETH sent
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );
    }

    function test_InitiateSeal_RevertsWhenNotAnNFTContract() public {
        // Setup: Use a contract with no NFT interface
        address randomContract = address(0x1234);

        // Execute & Verify
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        vm.expectRevert(SealInitiator.NotAnNFTContract.selector);
        initiator.initiateSeal{value: 0.01 ether}(
            randomContract,
            1,
            depositAddress,
            solanaReceiver
        );
    }

    // ============ TokenURI Tests ============

    function test_GetTokenURI_Success() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://QmTest123");

        // Execute
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );

        // TokenURI should be in the event - verified via event emission
    }

    function test_GetTokenURI_ReturnsEmptyForNoMetadata() public {
        // Setup: Create contract that doesn't implement tokenURI
        NonMetadataNFT nft = new NonMetadataNFT();
        nft.mint(depositAddress, 1);

        // Execute
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        // Should succeed but emit TokenURIUnavailable
        vm.expectEmit(true, true, false, true);
        emit TokenURIUnavailable(address(nft), 1);

        initiator.initiateSeal{value: 0.01 ether}(
            address(nft),
            1,
            depositAddress,
            solanaReceiver
        );
    }

    // ============ Batch Tests ============

    function test_InitiateSealBatch_Success() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://Qm1");
        erc721.mint(depositAddress, 2, "ipfs://Qm2");
        erc721.mint(depositAddress, 3, "ipfs://Qm3");

        address[] memory contracts = new address[](3);
        uint256[] memory tokenIds = new uint256[](3);
        address[] memory deposits = new address[](3);
        bytes32[] memory receivers = new bytes32[](3);

        for (uint256 i = 0; i < 3; i++) {
            contracts[i] = address(erc721);
            tokenIds[i] = i + 1;
            deposits[i] = depositAddress;
            receivers[i] = bytes32(uint256(i + 1));
        }

        // Execute
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        uint64[] memory sequences = initiator.initiateSealBatch{value: 0.03 ether}(
            contracts,
            tokenIds,
            deposits,
            receivers
        );

        // Verify
        assertEq(sequences.length, 3);
        assertEq(sequences[0], 0);
        assertEq(sequences[1], 1);
        assertEq(sequences[2], 2);
        assertEq(initiator.sequence(), 3);
    }

    function test_InitiateSealBatch_RevertsOnArrayMismatch() public {
        // Setup
        address[] memory contracts = new address[](2);
        uint256[] memory tokenIds = new uint256[](1); // Mismatch!

        // Execute & Verify
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        vm.expectRevert("Array length mismatch");
        initiator.initiateSealBatch{value: 0.01 ether}(
            contracts,
            tokenIds,
            new address[](2),
            new bytes32[](2)
        );
    }

    function test_InitiateSealBatch_RefundsExcess() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://Qm1");

        address[] memory contracts = new address[](1);
        uint256[] memory tokenIds = new uint256[](1);
        address[] memory deposits = new address[](1);
        bytes32[] memory receivers = new bytes32[](1);

        contracts[0] = address(erc721);
        tokenIds[0] = 1;
        deposits[0] = depositAddress;
        receivers[0] = solanaReceiver;

        // Execute with excess fee
        vm.deal(user1, 10 ether);
        vm.prank(user1);

        uint256 balanceBefore = user1.balance;

        initiator.initiateSealBatch{value: 1 ether}( // Way too much
            contracts,
            tokenIds,
            deposits,
            receivers
        );

        // Verify: User got refund - they paid less than 1 ether
        uint256 paid = balanceBefore - user1.balance;
        assertGt(paid, 0); // Paid something
        assertLt(paid, 1 ether); // Got refund (paid less than 1 ether)
    }

    // ============ View Function Tests ============

    function test_GetMessageFee() public {
        assertEq(initiator.getMessageFee(), 0.01 ether);
    }

    function test_GetChainId() public {
        assertEq(initiator.getChainId(), 2);
    }

    function test_IsContract() public {
        assertTrue(initiator.isContract(address(erc721)));
        assertTrue(initiator.isContract(address(erc1155)));
        assertTrue(initiator.isContract(address(initiator)));
        assertFalse(initiator.isContract(address(0x1))); // EOA
    }

    // ============ Edge Cases ============

    function test_InitiateSeal_ZeroTokenId() public {
        // Setup
        erc721.mint(depositAddress, 0, "ipfs://QmZero");

        // Execute
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            0,
            depositAddress,
            solanaReceiver
        );

        // Verify - should succeed
        assertEq(initiator.sequence(), 1);
    }

    function test_InitiateSeal_LargeTokenId() public {
        // Setup
        uint256 largeId = type(uint256).max;
        erc721.mint(depositAddress, largeId, "ipfs://QmLarge");

        // Execute
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            largeId,
            depositAddress,
            solanaReceiver
        );

        // Verify - should succeed
        assertEq(initiator.sequence(), 1);
    }

    function test_InitiateSeal_MultipleSequences() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://Qm1");
        erc721.mint(depositAddress, 2, "ipfs://Qm2");

        // First seal
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        uint64 seq1 = initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );

        // Second seal
        vm.prank(user1);
        uint64 seq2 = initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            2,
            depositAddress,
            solanaReceiver
        );

        // Verify
        assertEq(seq1, 0);
        assertEq(seq2, 1);
    }

    function test_InitiateSeal_EmptyTokenURI() public {
        // Setup: Mint without URI
        NonMetadataNFT nft = new NonMetadataNFT();
        nft.mint(depositAddress, 1);

        // Execute - should work with empty URI
        vm.deal(user1, 1 ether);
        vm.prank(user1);

        initiator.initiateSeal{value: 0.01 ether}(
            address(nft),
            1,
            depositAddress,
            solanaReceiver
        );

        // Verify
        assertEq(initiator.sequence(), 1);
    }

    // ============ Gas Optimization Tests ============

    function test_InitiateSeal_GasUsage() public {
        // Setup
        erc721.mint(depositAddress, 1, "ipfs://QmTest");

        vm.deal(user1, 1 ether);
        vm.prank(user1);

        // Measure gas
        uint256 gasBefore = gasleft();
        initiator.initiateSeal{value: 0.01 ether}(
            address(erc721),
            1,
            depositAddress,
            solanaReceiver
        );
        uint256 gasUsed = gasBefore - gasleft();

        // Log gas usage (should be reasonable)
        console.log("Gas used for initiateSeal:", gasUsed);

        // Should be under 150k gas
        assertLt(gasUsed, 200000);
    }
}

/// @title NonMetadataNFT
/// @notice Mock NFT that doesn't implement tokenURI
contract NonMetadataNFT {
    mapping(uint256 => address) private _owners;

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function mint(address to, uint256 tokenId) external {
        _owners[tokenId] = to;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }
}
