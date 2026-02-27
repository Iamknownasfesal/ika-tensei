// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IWormhole
/// @notice Interface for Wormhole core bridge contract
interface IWormhole {
    /// @notice Publish a message to the Wormhole network
    /// @param nonce A free integer field (used as batch ID)
    /// @param payload The arbitrary message payload
    /// @param consistencyLevel Finality level required before guardians sign
    /// @return sequence The unique sequence number for this message
    function publishMessage(
        uint32 nonce,
        bytes memory payload,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence);

    /// @notice Get the current message fee
    /// @return fee The fee in wei required to publish a message
    function messageFee() external view returns (uint256 fee);

    /// @notice Get the chain ID
    function chainId() external view returns (uint16);

    /// @notice Parse and verify a VAA
    /// @param encodedVM The encoded VAA bytes
    /// @return vm The parsed VM struct
    /// @return valid Whether the VAA is valid
    /// @return reason If invalid, the reason
    function parseAndVerifyVM(
        bytes calldata encodedVM
    ) external view returns (
        bytes32 vm,
        bool valid,
        string memory reason
    );
}
