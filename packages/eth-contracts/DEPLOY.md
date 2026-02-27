# Ika Tensei ETH Deposit Contract - Deployment Status

## Generated Deployer Key

- **Address**: `0xa2050d977E23ce6f2463CdfF525E6f15d67cDA3e`
- **Private Key**: `0xd976fbdeea5d62d28060613f437d731e4c11a45e169d1dec441d8a6fefc57bb6`

⚠️ **SAVE THIS KEY** - This is a fresh key with no funds yet.

## Deployment Status

**BLOCKED**: Need Sepolia ETH to deploy

### Issue
- All tested RPC endpoints (rpc.sepolia.org, etc.) hang on HTTP requests from this environment
- Faucets (QuickNode, Alchemy, Chainlink) require browser/wallet interaction
- Working RPC: `https://ethereum-sepolia-rpc.publicnode.com`

### Current Balance
```
0 ETH
```

## Deployment Commands (Ready to Execute)

Once you have Sepolia ETH:

```bash
# Set environment
export DEPLOYER_PRIVATE_KEY=0xd976fbdeea5d62d28060613f437d731e4c11a45e169d1dec441d8a6fefc57bb6

# Deploy (using working RPC)
cd /home/ubuntu/clawd/ika-tensei/packages/eth-contracts
forge create --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key $DEPLOYER_PRIVATE_KEY \
  src/IkaTenseiDeposit.sol:IkaTenseiDeposit \
  --constructor-args 0 0xa2050d977E23ce6f2463CdfF525E6f15d67cDA3e false
```

## Contract Details

- **Wormhole Core (Sepolia)**: `0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78`
- **Source Chain ID**: 2 (Ethereum)
- **Constructor args**: 
  - `_initialFee`: 0
  - `_feeRecipient`: 0xa2050d977E23ce6f2463CdfF525E6f15d67cDA3e
  - `_useMainnet`: false (use Sepolia)

## To Get Sepolia ETH

1. Go to https://faucets.chain.link/sepolia or https://sepoliafaucet.com
2. Connect wallet (MetaMask)
3. Request testnet ETH
4. Send to: `0xa2050d977E23ce6f2463CdfF525E6f15d67cDA3e`

## Next Steps After Deployment

1. Deploy mock ERC721 for testing
2. Call depositNft function
3. Record Wormhole sequence number from event
4. Update this file with deployment details
