// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

contract MiladyTestNFT2 {
    string public name = "Milady Maker";
    string public symbol = "MILADY";
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string) private _tokenURIs;

    function ownerOf(uint256 tokenId) external view returns (address) { return _owners[tokenId]; }
    function balanceOf(address owner) external view returns (uint256) { return _balances[owner]; }
    function tokenURI(uint256 tokenId) external view returns (string memory) { return _tokenURIs[tokenId]; }
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
    function initiateSeal(address nftContract, uint256 tokenId, address depositAddress, bytes32 solanaReceiver) external payable returns (uint64);
    function getMessageFee() external view returns (uint256);
}

contract TestMiladyE2E is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address sealInitiator = 0xC3f5B155ce06c7cBC470B4e8603AB00a65f1fDc7;
        
        // dWallet deposit address from relayer API
        address depositAddress = 0x9DBe24B8809627212Ce6F4d285F4aCC1Af439c93;
        
        // Solana receiver (relayer wallet for testing)
        bytes32 solanaReceiver = 0x383133423ab1786534bf5421bc38b91b7d1a7ba677820069ffe7e5de69fdad99;
        
        string memory miladyURI = "https://www.miladymaker.net/milady/json/1";

        vm.startBroadcast(pk);

        MiladyTestNFT2 nft = new MiladyTestNFT2();
        console.log("MiladyTestNFT2 deployed at:", address(nft));

        nft.mint(depositAddress, 1, miladyURI);
        console.log("Minted Milady 1 to dWallet deposit:", depositAddress);
        console.log("Token URI:", nft.tokenURI(1));

        uint256 fee = ISealInitiator(sealInitiator).getMessageFee();
        uint64 seq = ISealInitiator(sealInitiator).initiateSeal{value: fee}(
            address(nft), 1, depositAddress, solanaReceiver
        );
        console.log("Seal initiated! Wormhole sequence:", seq);

        vm.stopBroadcast();
    }
}
