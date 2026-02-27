// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/// @notice Minimal ERC-721 for testing — supports ownerOf, tokenURI, supportsInterface
contract TestNFT {
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

    function mint(address to, uint256 tokenId, string memory uri) external {
        _owners[tokenId] = to;
        _balances[to]++;
        _tokenURIs[tokenId] = uri;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }
}

interface ISealInitiator {
    function initiateSeal(
        address nftContract,
        uint256 tokenId,
        address depositAddress,
        bytes32 solanaReceiver
    ) external payable returns (uint64 sequenceNumber);

    function getMessageFee() external view returns (uint256);
}

/// @notice Deploy TestNFT, mint to deposit address, call initiateSeal
contract TestSeal is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address sealInitiator = 0xC3f5B155ce06c7cBC470B4e8603AB00a65f1fDc7;
        address depositAddress = 0x22298EB649811317a13dc7C01246E484C5B5615F;
        bytes32 solanaReceiver = 0x383133423ab1786534bf5421bc38b91b7d1a7ba677820069ffe7e5de69fdad99;

        vm.startBroadcast(pk);

        // 1. Deploy TestNFT
        TestNFT nft = new TestNFT();
        console.log("TestNFT deployed at:", address(nft));

        // 2. Mint token 1 to the deposit address
        nft.mint(depositAddress, 1, "ipfs://QmTestIkaTenseiReborn001");
        console.log("Minted token 1 to deposit address:", depositAddress);
        console.log("Owner of token 1:", nft.ownerOf(1));

        // 3. Get Wormhole fee
        uint256 fee = ISealInitiator(sealInitiator).getMessageFee();
        console.log("Wormhole message fee:", fee);

        // 4. Call initiateSeal
        uint64 seq = ISealInitiator(sealInitiator).initiateSeal{value: fee}(
            address(nft),
            1,
            depositAddress,
            solanaReceiver
        );
        console.log("Seal initiated! Wormhole sequence:", seq);

        vm.stopBroadcast();
    }
}
