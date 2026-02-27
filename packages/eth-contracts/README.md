# Ika Tensei - Ethereum Contracts

![Solidity](https://img.shields.io/badge/Language-Solidity-blue)
![Tests](https://img.shields.io/badge/Tests-39%2F39-green)
![Foundry](https://img.shields.io/badge/Framework-Foundry-yellow)

Ethereum smart contract for depositing NFTs and emitting Wormhole attestations for cross-chain reincarnation.

## Overview

`IkaTenseiDeposit.sol` is the entry point for Ethereum NFTs into the Ika Tensei protocol. It supports both ERC-721 and ERC-1155 tokens, transfers them to a dWallet address, and emits Wormhole messages for cross-chain verification.

## Contract: IkaTenseiDeposit

```solidity
contract IkaTenseiDeposit is Ownable, ReentrancyGuard, Pausable, IERC1155Receiver
```

### Key Features

- **ERC-721 Support**: Deposit single NFTs
- **ERC-1155 Support**: Deposit batch/fractional NFTs
- **Wormhole Integration**: Cross-chain messaging
- **Fee Collection**: Protocol fees + gas reimbursement
- **Replay Protection**: Nonce tracking
- **Pausable**: Emergency stop functionality

### Constants

```solidity
address public constant WORMHOLE_MAINNET = 0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B;
address public constant WORMHOLE_SEPOLIA = 0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78;
uint8 public constant PAYLOAD_ID_NFT_DEPOSIT = 1;
uint16 public constant SOURCE_CHAIN_ID = 2;  // Ethereum
uint8 public constant CONSISTENCY_LEVEL = 1;
```

### State Variables

```solidity
address public wormholeCore;      // Wormhole core bridge address
uint256 public depositFee;        // Protocol fee in wei
address public feeRecipient;      // Fee collector
mapping(bytes32 => bool) public usedNonces;
uint64 public sequence;           // Message sequence counter
```

## Functions

### Deposit Functions

#### depositERC721

```solidity
function depositERC721(
    address nftContract,
    uint256 tokenId,
    address dwalletAddress,
    bytes32 sealNonce
) external payable nonReentrant whenNotPaused returns (uint64 wormholeSequence)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `nftContract` | address | ERC-721 contract address |
| `tokenId` | uint256 | Token ID to deposit |
| `dwalletAddress` | address | Destination dWallet address |
| `sealNonce` | bytes32 | Unique nonce for replay protection |

**Flow:**
1. Validate inputs and fee payment
2. Check nonce for replay protection
3. Transfer NFT from depositor to dWallet address
4. Build 171-byte payload
5. Publish to Wormhole
6. Emit `NftDeposited` event
7. Refund excess fee, transfer protocol fee to recipient

#### depositERC1155

```solidity
function depositERC1155(
    address nftContract,
    uint256 tokenId,
    uint256 amount,
    address dwalletAddress,
    bytes32 sealNonce
) external payable nonReentrant whenNotPaused returns (uint64 wormholeSequence)
```

Same flow as ERC-721 but for ERC-1155 tokens with amount parameter.

### Admin Functions

| Function | Description |
|----------|-------------|
| `setFee(uint256 newFee)` | Update deposit fee |
| `setFeeRecipient(address newFeeRecipient)` | Update fee recipient |
| `setWormholeCore(address newWormholeCore)` | Update Wormhole address |
| `pause()` | Pause deposits |
| `unpause()` | Resume deposits |

### View Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `getWormholeFee()` | uint256 | Current Wormhole message fee |
| `isNonceUsed(bytes32 nonce)` | bool | Check if nonce was used |

## Events

```solidity
event NftDeposited(
    address indexed nftContract,
    uint256 indexed tokenId,
    address indexed depositor,
    address dwalletAddress,
    bytes32 sealNonce,
    uint64 wormholeSequence
);

event FeeUpdated(uint256 newFee);
event FeeRecipientUpdated(address newFeeRecipient);
event WormholeCoreUpdated(address newWormholeCore);
```

## Wormhole Payload Format

The deposit payload is 171 bytes:

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | payload_id (1) |
| 1 | 2 | source_chain_id (u16 BE) |
| 3 | 32 | nft_contract (address padded) |
| 35 | 32 | token_id (u256 padded) |
| 67 | 32 | depositor (address padded) |
| 99 | 32 | dwallet_address (address padded) |
| 131 | 8 | deposit_block (u64 BE) |
| 139 | 32 | seal_nonce (bytes32) |

## Fee Mechanism

```
msg.value = depositFee + wormholeFee

// Excess refunded to depositor
if (msg.value > totalFee) {
    payable(msg.sender).transfer(msg.value - totalFee);
}

// Protocol fee to recipient
payable(feeRecipient).transfer(depositFee);
```

## Building

```bash
# Install dependencies
forge install

# Build contracts
forge build
```

## Testing

```bash
# Run all tests
forge test

# Run specific test
forge test --match-test testDepositERC721
```

**Status:** 39/39 tests passing (12 functional + 27 security)

## Deployment

### Constructor Parameters

```solidity
constructor(
    uint256 _initialFee,      // Initial deposit fee in wei
    address _feeRecipient,    // Fee collector address
    bool _useMainnet          // Use mainnet (true) or Sepolia (false) Wormhole
)
```

### Deployer Address

```
0xa2050d977E23ce6f2463CdfF525E6f15d67cDA3e
```

### Example Deployment (Foundry)

```bash
# Deploy to Sepolia
forge create src/IkaTenseiDeposit.sol:IkaTenseiDeposit \
  --constructor-args 1000000000000000 0xa2050d977E23ce6f2463CdfF525E6f15d67cDA3e false \
  --rpc-url sepolia \
  --private-key $PRIVATE_KEY \
  --verify
```

## Integrations

### Wormhole Interface

```solidity
interface IWormhole {
    function publishMessage(
        uint32 nonce,
        bytes memory payload,
        uint8 consistencyLevel
    ) external payable returns (uint64 sequence);
    
    function messageFee() external view returns (uint256);
}
```

### Supported NFT Standards

- **ERC-721**: Single token deposits via `IERC721`
- **ERC-1155**: Multi-token/fractional deposits via `IERC1155`

## Security Considerations

1. **Reentrancy Guard**: All deposit functions are non-reentrant
2. **Nonce Tracking**: Each sealNonce can only be used once
3. **Pausable**: Emergency stop capability
4. **Access Control**: Only owner can update fees and addresses
5. **Fee Validation**: Requires sufficient payment for Wormhole gas

## License

MIT
