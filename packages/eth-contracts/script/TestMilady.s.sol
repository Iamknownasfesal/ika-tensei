// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/// @notice Minimal ERC-721 that mimics a Milady NFT on Base Sepolia
contract MiladyTestNFT {
    string public name = "Milady Maker";
    string public symbol = "MILADY";

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

/// @notice Deploy MiladyTestNFT, mint "Milady 1" to deposit address, call initiateSeal
contract TestMilady is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // SealInitiator already deployed on Base Sepolia
        address sealInitiator = 0xC3f5B155ce06c7cBC470B4e8603AB00a65f1fDc7;

        // Use deployer as deposit address for simplicity
        address depositAddress = deployer;

        // Solana receiver (32 bytes) — use the same test receiver
        bytes32 solanaReceiver = 0x383133423ab1786534bf5421bc38b91b7d1a7ba677820069ffe7e5de69fdad99;

        // Milady #1 metadata URI from Ethereum mainnet
        string memory miladyURI = "https://www.miladymaker.net/milady/json/1";

        vm.startBroadcast(pk);

        // 1. Deploy MiladyTestNFT
        MiladyTestNFT nft = new MiladyTestNFT();
        console.log("MiladyTestNFT deployed at:", address(nft));

        // 2. Mint "Milady 1" to the deposit address
        nft.mint(depositAddress, 1, miladyURI);
        console.log("Minted Milady 1 to deposit address:", depositAddress);
        console.log("Owner of token 1:", nft.ownerOf(1));
        console.log("Token URI:", nft.tokenURI(1));

        // 3. Get Wormhole fee
        uint256 fee = ISealInitiator(sealInitiator).getMessageFee();
        console.log("Wormhole message fee:", fee);

        // 4. Call initiateSeal — sends Wormhole VAA
        uint64 seq = ISealInitiator(sealInitiator).initiateSeal{value: fee}(
            address(nft),
            1,
            depositAddress,
            solanaReceiver
        );
        console.log("Seal initiated! Wormhole sequence:", seq);

        vm.stopBroadcast();

        // Summary
        console.log("---");
        console.log("NFT Contract:", address(nft));
        console.log("Token ID: 1");
        console.log("Name: Milady 1");
        console.log("URI:", miladyURI);
        console.log("Source Chain: Base Sepolia (Wormhole chain ID 10004)");
        console.log("Wormhole Sequence:", seq);
    }
}
