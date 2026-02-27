// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IWormhole} from "./interfaces/IWormhole.sol";

/// @title SealInitiator
/// @notice Permissionless contract to initiate NFT seal for Ika Tensei cross-chain rebirth.
/// @dev Part of Ika Tensei v6 architecture — Sui-orchestrated Wormhole.
///      Reads NFT state on source chain, emits a Wormhole VAA for Sui verification.
///
///      Payload wire format (binary, NOT ABI-encoded):
///      ┌────────┬────────────┬──────────────┬────────────┬─────────────────┬──────────┬─────────────────┐
///      │ Offset │  Size      │  Field        │  Type      │  Notes          │          │                 │
///      ├────────┼────────────┼──────────────┼────────────┼─────────────────┤          │                 │
///      │   0    │  1 byte    │ payload_type  │ uint8      │ always 1        │          │                 │
///      │   1    │  2 bytes   │ source_chain  │ uint16 BE  │ Wormhole chain  │          │                 │
///      │   3    │ 32 bytes   │ nft_contract  │ bytes32    │ address left-   │          │                 │
///      │        │            │               │            │ padded w/ zeros │          │                 │
///      │  35    │ 32 bytes   │ token_id      │ uint256 BE │                 │          │                 │
///      │  67    │ 32 bytes   │ deposit_addr  │ bytes32    │ address left-   │          │                 │
///      │        │            │               │            │ padded w/ zeros │          │                 │
///      │  99    │ 32 bytes   │ receiver      │ bytes32    │ Sui/Solana addr │          │                 │
///      │ 131    │ variable   │ token_uri     │ raw bytes  │ UTF-8, no len   │          │                 │
///      └────────┴────────────┴──────────────┴────────────┴─────────────────┘          │                 │
contract SealInitiator {
    // ============ Constants ============

    /// @notice Payload type ID for Seal Attestation (PRD v6).
    uint8 public constant PAYLOAD_TYPE_SEAL = 1;

    /// @notice Wormhole core bridge address — Ethereum mainnet.
    address public constant WORMHOLE_MAINNET = 0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B;

    /// @notice Wormhole core bridge address — Ethereum Sepolia testnet.
    address public constant WORMHOLE_SEPOLIA = 0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78;

    /// @notice Consistency level 1 = finalized (safe for production).
    uint8 public constant CONSISTENCY_LEVEL = 1;

    /// @notice Maximum token URI length accepted in a payload.
    ///         Prevents gas-griefing via oversized Wormhole messages.
    uint256 public constant MAX_URI_LENGTH = 2048;

    /// @notice Maximum number of NFTs in a single batch seal.
    ///         Prevents gas griefing via unbounded loops.
    uint256 public constant MAX_BATCH_SIZE = 50;

    // ============ Immutables ============

    /// @notice Address of the Wormhole core contract.
    IWormhole public immutable wormhole;

    /// @notice CryptoPunks contract address.
    ///         Passed at deploy time so the same bytecode works on mainnet, testnets,
    ///         and local forks without a hard-coded mainnet address.
    address public immutable cryptoPunksAddress;

    // ============ State Variables ============

    /// @notice Monotonically increasing nonce for Wormhole messages.
    /// @dev    Used as the `nonce` argument to `publishMessage`.  Cast to uint32
    ///         with a bitmask; wrapping is acceptable because the nonce is not a
    ///         security primitive — Wormhole uses sequence numbers internally.
    uint64 public sequence;

    /// @notice Tracks which NFTs have already been sealed to prevent replay.
    /// @dev    Key: keccak256(abi.encodePacked(nftContract, tokenId))
    mapping(bytes32 => bool) public sealedNFTs;

    // ============ Events ============

    /// @notice Emitted when an NFT seal is successfully initiated.
    event SealInitiated(
        address indexed nftContract,
        uint256 indexed tokenId,
        address depositAddress,
        string tokenURI,
        bytes32 solanaReceiver,
        uint64 wormholeSequence,
        uint16 sourceChainId
    );

    /// @notice Emitted when tokenURI retrieval fails (contract has no metadata).
    /// @dev    ERC-1155 note: balance > 0 only proves the deposit address holds
    ///         *some* quantity of this token ID.  For fungible ERC-1155 tokens this
    ///         check is ambiguous; downstream Sui logic must handle that case.
    event TokenURIUnavailable(
        address indexed nftContract,
        uint256 indexed tokenId
    );

    // ============ Errors ============

    /// @notice NFT is not held at the supplied deposit address.
    error NotAtDepositAddress();

    /// @notice Target address has no contract code.
    error NotAnNFTContract();

    /// @notice Ether sent does not cover the Wormhole message fee.
    error InsufficientFee();

    /// @notice This NFT has already been sealed — replay not allowed.
    error AlreadySealed();

    /// @notice Token URI exceeds the maximum allowed length.
    error URITooLong();

    /// @notice Batch size exceeds maximum.
    error BatchTooLarge();

    // ============ Constructor ============

    /// @notice Deploy SealInitiator.
    /// @param _wormhole     Address of the Wormhole core bridge (mainnet or testnet).
    /// @param _cryptoPunks  Address of the CryptoPunks contract on the target network.
    ///                      Pass `address(0)` to disable CryptoPunks support.
    constructor(address _wormhole, address _cryptoPunks) {
        require(_wormhole != address(0), "Invalid wormhole address");
        wormhole = IWormhole(_wormhole);
        cryptoPunksAddress = _cryptoPunks;
    }

    // ============ External Functions ============

    /// @notice Initiate seal for a single NFT.
    /// @dev    Permissionless — anyone can call for any deposit address.
    ///         Verifies on-chain ownership, reads tokenURI, emits a Wormhole VAA.
    /// @param nftContract    Address of the NFT contract (ERC-721, ERC-1155, or CryptoPunks).
    /// @param tokenId        Token ID to seal.
    /// @param depositAddress dWallet deposit address on the source chain.
    /// @param solanaReceiver User's Sui/Solana wallet address (32 bytes, left-padded).
    /// @return sequenceNumber  The Wormhole sequence number for this message.
    function initiateSeal(
        address nftContract,
        uint256 tokenId,
        address depositAddress,
        bytes32 solanaReceiver
    ) external payable returns (uint64 sequenceNumber) {
        // 1. Replay protection
        bytes32 sealKey = keccak256(abi.encodePacked(nftContract, tokenId));
        if (sealedNFTs[sealKey]) {
            revert AlreadySealed();
        }
        sealedNFTs[sealKey] = true;

        // 2. Verify the NFT is at the deposit address
        _verifyOwnership(nftContract, tokenId, depositAddress);

        // 3. Read tokenURI (view-safe; event emitted here if unavailable)
        (string memory uri, bool uriAvailable) = _getTokenURI(nftContract, tokenId);
        if (!uriAvailable) {
            emit TokenURIUnavailable(nftContract, tokenId);
        }

        // 4. Enforce URI length limit
        if (bytes(uri).length > MAX_URI_LENGTH) {
            revert URITooLong();
        }

        // 5. Build binary payload
        bytes memory payload = _buildPayload(
            nftContract,
            tokenId,
            depositAddress,
            solanaReceiver,
            uri
        );

        // 6. Collect fee and publish Wormhole message
        uint256 fee = wormhole.messageFee();
        if (msg.value < fee) {
            revert InsufficientFee();
        }

        // Nonce wraps at uint32 max — acceptable, it is not a security primitive.
        uint32 nonce = uint32(sequence & 0xFFFFFFFF);
        sequence++;

        sequenceNumber = wormhole.publishMessage{value: fee}(
            nonce,
            payload,
            CONSISTENCY_LEVEL
        );

        // 7. Emit indexing event
        emit SealInitiated(
            nftContract,
            tokenId,
            depositAddress,
            uri,
            solanaReceiver,
            sequenceNumber,
            wormhole.chainId()
        );

        // 8. Refund excess ETH
        if (msg.value > fee) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }
    }

    /// @notice Initiate seal for multiple NFTs in one transaction.
    /// @param nftContracts    Array of NFT contract addresses.
    /// @param tokenIds        Array of token IDs (parallel with nftContracts).
    /// @param depositAddresses Array of deposit addresses (parallel).
    /// @param solanaReceivers Array of Sui/Solana receiver addresses (parallel).
    /// @return sequenceNumbers  Wormhole sequence numbers, one per NFT.
    function initiateSealBatch(
        address[] calldata nftContracts,
        uint256[] calldata tokenIds,
        address[] calldata depositAddresses,
        bytes32[] calldata solanaReceivers
    ) external payable returns (uint64[] memory sequenceNumbers) {
        if (nftContracts.length > MAX_BATCH_SIZE) {
            revert BatchTooLarge();
        }
        require(
            nftContracts.length == tokenIds.length &&
            tokenIds.length == depositAddresses.length &&
            depositAddresses.length == solanaReceivers.length,
            "Array length mismatch"
        );

        uint256 fee = wormhole.messageFee();
        uint256 totalFee = fee * nftContracts.length;
        if (msg.value < totalFee) {
            revert InsufficientFee();
        }

        sequenceNumbers = new uint64[](nftContracts.length);

        for (uint256 i = 0; i < nftContracts.length; i++) {
            // Replay protection per item
            bytes32 sealKey = keccak256(abi.encodePacked(nftContracts[i], tokenIds[i]));
            if (sealedNFTs[sealKey]) {
                revert AlreadySealed();
            }
            sealedNFTs[sealKey] = true;

            // Verify ownership
            _verifyOwnership(nftContracts[i], tokenIds[i], depositAddresses[i]);

            // Get URI (view-safe)
            (string memory uri, bool uriAvailable) = _getTokenURI(nftContracts[i], tokenIds[i]);
            if (!uriAvailable) {
                emit TokenURIUnavailable(nftContracts[i], tokenIds[i]);
            }

            if (bytes(uri).length > MAX_URI_LENGTH) {
                revert URITooLong();
            }

            // Build payload
            bytes memory payload = _buildPayload(
                nftContracts[i],
                tokenIds[i],
                depositAddresses[i],
                solanaReceivers[i],
                uri
            );

            // Publish message
            uint32 nonce = uint32(sequence & 0xFFFFFFFF);
            sequence++;

            sequenceNumbers[i] = wormhole.publishMessage{value: fee}(
                nonce,
                payload,
                CONSISTENCY_LEVEL
            );

            emit SealInitiated(
                nftContracts[i],
                tokenIds[i],
                depositAddresses[i],
                uri,
                solanaReceivers[i],
                sequenceNumbers[i],
                wormhole.chainId()
            );
        }

        // Refund excess ETH
        if (msg.value > totalFee) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - totalFee}("");
            require(ok, "Refund failed");
        }
    }

    // ============ Internal Functions ============

    /// @notice Verify NFT ownership matches the deposit address.
    /// @dev    Handles ERC-721, ERC-1155 (balance check), and CryptoPunks.
    ///         ERC-1155 note: `balance > 0` only proves possession of *some* quantity;
    ///         fungible ERC-1155 tokens are inherently ambiguous here.
    function _verifyOwnership(
        address nftContract,
        uint256 tokenId,
        address depositAddress
    ) internal view {
        // CryptoPunks: distinct ownership mapping
        if (cryptoPunksAddress != address(0) && nftContract == cryptoPunksAddress) {
            _verifyCryptoPunksOwnership(tokenId, depositAddress);
            return;
        }

        // Try ERC-721 ownerOf (most common)
        (bool success, bytes memory data) = nftContract.staticcall(
            abi.encodeWithSelector(IERC721.ownerOf.selector, tokenId)
        );

        if (success && data.length >= 32) {
            address owner = abi.decode(data, (address));
            if (owner == depositAddress) {
                return;
            }
            revert NotAtDepositAddress();
        }

        // Try ERC-1155 balanceOf
        (success, data) = nftContract.staticcall(
            abi.encodeWithSelector(
                IERC1155.balanceOf.selector,
                depositAddress,
                tokenId
            )
        );

        if (success && data.length >= 32) {
            uint256 balance = abi.decode(data, (uint256));
            if (balance > 0) {
                return;
            }
            revert NotAtDepositAddress();
        }

        // Verify the target address has contract code before giving up
        if (nftContract.code.length == 0) {
            revert NotAnNFTContract();
        }

        // Final fallback: ownerOf via sig (some non-compliant ERC-721 contracts)
        (success, data) = nftContract.staticcall(
            abi.encodeWithSignature("ownerOf(uint256)", tokenId)
        );

        if (success && data.length >= 32) {
            address owner = abi.decode(data, (address));
            if (owner == depositAddress) {
                return;
            }
        }

        revert NotAtDepositAddress();
    }

    /// @notice Verify CryptoPunks ownership via the `punkIndexToAddress` mapping.
    function _verifyCryptoPunksOwnership(
        uint256 punkIndex,
        address depositAddress
    ) internal view {
        (bool success, bytes memory data) = cryptoPunksAddress.staticcall(
            abi.encodeWithSignature("punkIndexToAddress(uint256)", punkIndex)
        );

        if (success && data.length >= 32) {
            address owner = abi.decode(data, (address));
            if (owner != depositAddress) {
                revert NotAtDepositAddress();
            }
            return;
        }

        revert NotAtDepositAddress();
    }

    /// @notice Attempt to read the tokenURI from an NFT contract.
    /// @dev    Pure view function — no events emitted; callers are responsible for
    ///         emitting `TokenURIUnavailable` when `available` is false.
    ///         Tries ERC-721 `tokenURI(uint256)`, then ERC-1155 `uri(uint256)`,
    ///         with {id} placeholder replacement for ERC-1155.
    ///         CryptoPunks have no on-chain metadata; returns ("", false).
    /// @return uri       The token URI string (empty when unavailable).
    /// @return available True when a URI was successfully retrieved.
    function _getTokenURI(
        address nftContract,
        uint256 tokenId
    ) internal view returns (string memory uri, bool available) {
        // Try ERC-721 tokenURI(uint256)
        (bool success, bytes memory data) = nftContract.staticcall(
            abi.encodeWithSelector(IERC721Metadata.tokenURI.selector, tokenId)
        );

        if (success && data.length > 0) {
            return (abi.decode(data, (string)), true);
        }

        // Try ERC-1155 uri(uint256) — may contain {id} placeholder
        (success, data) = nftContract.staticcall(
            abi.encodeWithSelector(IERC1155URI.uri.selector, tokenId)
        );

        if (success && data.length > 0) {
            string memory raw = abi.decode(data, (string));
            return (_replaceTokenId(raw, tokenId), true);
        }

        // CryptoPunks: no on-chain metadata
        if (cryptoPunksAddress != address(0) && nftContract == cryptoPunksAddress) {
            return ("", false);
        }

        // Final fallback via raw signature (non-standard ERC-721 variants)
        (success, data) = nftContract.staticcall(
            abi.encodeWithSignature("tokenURI(uint256)", tokenId)
        );

        if (success && data.length > 0) {
            return (abi.decode(data, (string)), true);
        }

        return ("", false);
    }

    /// @notice Build the binary Wormhole payload.
    /// @dev    Uses `abi.encodePacked` to produce the exact binary layout expected
    ///         by the Sui payload decoder.  Addresses are left-padded to 32 bytes
    ///         (Wormhole convention) via `bytes32(uint256(uint160(addr)))`.
    ///
    ///         Layout (total: 131 + len(tokenURI) bytes):
    ///           [0]      payload_type  (1 byte)
    ///           [1–2]    source_chain  (2 bytes BE)
    ///           [3–34]   nft_contract  (32 bytes, address left-padded)
    ///           [35–66]  token_id      (32 bytes BE)
    ///           [67–98]  deposit_addr  (32 bytes, address left-padded)
    ///           [99–130] receiver      (32 bytes)
    ///           [131+]   token_uri     (variable raw bytes, no length prefix)
    function _buildPayload(
        address nftContract,
        uint256 tokenId,
        address depositAddress,
        bytes32 solanaReceiver,
        string memory tokenURI
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            PAYLOAD_TYPE_SEAL,                            // 1 byte
            wormhole.chainId(),                           // 2 bytes (uint16 BE)
            bytes32(uint256(uint160(nftContract))),        // 32 bytes, left-padded
            tokenId,                                      // 32 bytes
            bytes32(uint256(uint160(depositAddress))),     // 32 bytes, left-padded
            solanaReceiver,                               // 32 bytes
            bytes(tokenURI)                               // variable, no length prefix
        );
    }

    /// @notice Replace ALL `{id}` placeholders in an ERC-1155 URI with the hex token ID.
    /// @dev    ERC-1155 spec §metadata: token ID must be substituted as a zero-padded
    ///         lowercase 64-character hex string (no `0x` prefix).
    ///         URIs may contain multiple `{id}` placeholders — all are replaced.
    function _replaceTokenId(
        string memory uri,
        uint256 tokenId
    ) internal pure returns (string memory) {
        bytes memory uriBytes = bytes(uri);
        bytes memory placeholder = bytes("{id}");
        bytes memory hexId = _toHex(tokenId);

        if (uriBytes.length < placeholder.length) {
            return uri;
        }

        // First pass: count occurrences to compute result length
        uint256 count = 0;
        for (uint256 i = 0; i <= uriBytes.length - placeholder.length; ) {
            bool found = true;
            for (uint256 j = 0; j < placeholder.length; j++) {
                if (uriBytes[i + j] != placeholder[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                count++;
                i += placeholder.length;
            } else {
                i++;
            }
        }

        if (count == 0) {
            return uri;
        }

        // Second pass: build result with all {id} replaced
        uint256 newLen = uriBytes.length + count * (hexId.length - placeholder.length);
        bytes memory result = new bytes(newLen);
        uint256 src = 0;
        uint256 dst = 0;
        while (src < uriBytes.length) {
            bool found = false;
            if (src + placeholder.length <= uriBytes.length) {
                found = true;
                for (uint256 j = 0; j < placeholder.length; j++) {
                    if (uriBytes[src + j] != placeholder[j]) {
                        found = false;
                        break;
                    }
                }
            }
            if (found) {
                for (uint256 k = 0; k < hexId.length; k++) {
                    result[dst + k] = hexId[k];
                }
                dst += hexId.length;
                src += placeholder.length;
            } else {
                result[dst] = uriBytes[src];
                dst++;
                src++;
            }
        }

        return string(result);
    }

    /// @notice Convert a uint256 to a zero-padded 64-character lowercase hex string.
    function _toHex(uint256 value) internal pure returns (bytes memory) {
        bytes memory buffer = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            uint8 nibble = uint8(value & 0xf);
            buffer[63 - i] = nibble < 10
                ? bytes1(uint8(nibble + 48))   // '0'–'9'
                : bytes1(uint8(nibble + 87));  // 'a'–'f'
            value >>= 4;
        }
        return buffer;
    }

    // ============ View Functions ============

    /// @notice Returns the current Wormhole message fee.
    function getMessageFee() external view returns (uint256) {
        return wormhole.messageFee();
    }

    /// @notice Returns the Wormhole chain ID for this deployment.
    function getChainId() external view returns (uint16) {
        return wormhole.chainId();
    }

    /// @notice Returns true if `addr` is a contract (has code).
    function isContract(address addr) external view returns (bool) {
        return addr.code.length > 0;
    }

    // ============ Receive ============

    /// @notice Accept ETH (fee refunds flow through here).
    receive() external payable {}
}

// ============ Supplementary Interfaces ============

/// @notice ERC-721 Metadata extension — subset needed for `tokenURI`.
interface IERC721Metadata is IERC721 {
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/// @notice ERC-1155 URI extension — needed for `uri(uint256)`.
interface IERC1155URI {
    function uri(uint256 tokenId) external view returns (string memory);
}
