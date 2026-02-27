// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISealInitiator
/// @notice Interface for SealInitiator contract (for cross-contract calls)
/// @dev Part of Ika Tensei v6 architecture
interface ISealInitiator {
    /// @notice Payload type ID for Seal Attestation
    function PAYLOAD_TYPE_SEAL() external view returns (uint8);

    /// @notice Wormhole core bridge address
    function WORMHOLE_MAINNET() external view returns (address);

    /// @notice Wormhole Sepolia testnet address
    function WORMHOLE_SEPOLIA() external view returns (address);

    /// @notice Initiate seal for an NFT
    /// @param nftContract Address of the NFT contract
    /// @param tokenId Token ID to seal
    /// @param depositAddress dWallet deposit address
    /// @param solanaReceiver User's Solana wallet (32 bytes)
    /// @return sequenceNumber The Wormhole sequence number
    function initiateSeal(
        address nftContract,
        uint256 tokenId,
        address depositAddress,
        bytes32 solanaReceiver
    ) external payable returns (uint64 sequenceNumber);

    /// @notice Batch initiate seals
    function initiateSealBatch(
        address[] calldata nftContracts,
        uint256[] calldata tokenIds,
        address[] calldata depositAddresses,
        bytes32[] calldata solanaReceivers
    ) external payable returns (uint64[] memory sequenceNumbers);

    /// @notice Get current message fee
    function getMessageFee() external view returns (uint256);

    /// @notice Get current chain ID
    function getChainId() external view returns (uint16);

    /// @notice Check if address is a contract
    function isContract(address addr) external view returns (bool);
}

/// @title SealInitiatorEvents
/// @notice Events emitted by SealInitiator (for off-chain indexing)
interface SealInitiatorEvents {
    /// @notice Emitted when NFT seal is initiated
    event SealInitiated(
        address indexed nftContract,
        uint256 indexed tokenId,
        address depositAddress,
        string tokenURI,
        bytes32 solanaReceiver,
        uint64 sequence,
        uint16 sourceChainId
    );

    /// @notice Emitted when tokenURI retrieval fails
    event TokenURIUnavailable(
        address indexed nftContract,
        uint256 indexed tokenId
    );
}
