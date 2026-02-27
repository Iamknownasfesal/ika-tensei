#!/bin/bash
set -e

# Ika Tensei — Multi-chain deployment script
# Deploys SealInitiator contracts to all source chains
#
# Prerequisites:
#   - Solana: `solana` CLI + devnet admin key at ~/.config/solana/devnet-admin.json
#   - EVM: `forge` CLI + funded deployer key in packages/eth-contracts/.env
#   - NEAR: `near` CLI + `cargo-near` + account ika-tensei-seal.testnet in keychain
#   - Aptos: `aptos` CLI + funded account (run `aptos init --network testnet`)
#
# Usage: bash scripts/deploy-all-chains.sh [solana|evm|near|aptos|all]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET=${1:-all}

echo "=== Ika Tensei Multi-Chain Deployment ==="
echo "Root: $ROOT_DIR"
echo "Target: $TARGET"
echo ""

# ─── Solana ───
deploy_solana() {
  echo "=== Solana: initialize_collection_registry ==="
  echo "Note: initialize_mint_config already done (TX: 4AbLYAQsmJ3dumXUxutELAN5h2amn96AVDn58nPePYyaRhT5vVXqkYz5T6TNeuCWZghw8nX3eK1RWN8oh3Ve1DPG)"
  echo ""
  echo "1. First upgrade the program (max_len fix):"
  echo "   cd $ROOT_DIR/packages/solana-program/ika-tensei-reborn"
  echo "   anchor build"
  echo "   solana program deploy programs/ika-tensei-reborn/target/deploy/ika_tensei_reborn.so \\"
  echo "     --program-id 2bW2SFSuiBMCef2xNk892uVfSTqjkRGmv6jD9PHKqzW4 \\"
  echo "     --keypair ~/.config/solana/devnet-admin.json --url devnet"
  echo ""
  echo "2. Then run initialization:"
  echo "   cd $ROOT_DIR/packages/relayer-v6"
  echo "   npx tsx scripts/initialize-solana.ts"
  echo ""
}

# ─── EVM (Ethereum Sepolia + Base Sepolia) ───
deploy_evm() {
  echo "=== EVM: Deploy SealInitiator ==="
  cd "$ROOT_DIR/packages/eth-contracts"

  if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    source .env 2>/dev/null || true
  fi

  if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "ERROR: DEPLOYER_PRIVATE_KEY not set in .env"
    echo "Set it in $ROOT_DIR/packages/eth-contracts/.env"
    return 1
  fi

  # Ethereum Sepolia
  echo "--- Deploying to Ethereum Sepolia ---"
  NETWORK=sepolia forge script script/DeploySealInitiator.s.sol \
    --rpc-url "${SEPOLIA_RPC_URL:-https://rpc.sepolia.org}" \
    --broadcast -vvv 2>&1 | tee /tmp/eth-sepolia-deploy.log
  echo ""

  # Base Sepolia
  echo "--- Deploying to Base Sepolia ---"
  NETWORK=base-sepolia forge script script/DeploySealInitiator.s.sol \
    --rpc-url "${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}" \
    --broadcast -vvv 2>&1 | tee /tmp/base-sepolia-deploy.log
  echo ""

  echo "EVM deployments complete. Check logs for contract addresses."
}

# ─── NEAR ───
deploy_near() {
  echo "=== NEAR: Deploy SealInitiator ==="
  cd "$ROOT_DIR/packages/near-contracts/seal-initiator"

  echo "Building with cargo-near..."
  cargo near build release 2>&1 || {
    echo "cargo-near not available, using raw build..."
    cargo build --release --target wasm32-unknown-unknown
  }

  WASM_PATH="target/near/seal_initiator_near/seal_initiator_near.wasm"
  if [ ! -f "$WASM_PATH" ]; then
    WASM_PATH="target/wasm32-unknown-unknown/release/seal_initiator_near.wasm"
  fi

  echo "Deploying $WASM_PATH to ika-tensei-seal.testnet..."
  near contract deploy ika-tensei-seal.testnet \
    use-file "$WASM_PATH" \
    with-init-call new json-args '{"wormhole_account": "wormhole.testnet"}' \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
    network-config testnet sign-with-keychain send

  echo ""
  echo "NEAR contract deployed to: ika-tensei-seal.testnet"
}

# ─── Aptos ───
deploy_aptos() {
  echo "=== Aptos: Deploy SealInitiator ==="
  cd "$ROOT_DIR/packages/aptos-contracts"

  echo "Publishing module..."
  aptos move publish \
    --named-addresses ika_tensei_aptos=default \
    --assume-yes 2>&1

  echo ""
  echo "Initializing contract..."
  aptos move run \
    --function-id default::seal_initiator::initialize \
    --assume-yes 2>&1

  echo ""
  echo "Aptos contract deployed and initialized."
}

# ─── Execute ───
case "$TARGET" in
  solana) deploy_solana ;;
  evm) deploy_evm ;;
  near) deploy_near ;;
  aptos) deploy_aptos ;;
  all)
    deploy_solana
    deploy_evm
    deploy_near
    deploy_aptos
    ;;
  *) echo "Usage: $0 [solana|evm|near|aptos|all]" ;;
esac

echo ""
echo "=== Deployment Summary ==="
echo "After all chains are deployed, register emitter addresses on Sui:"
echo "  npx tsx scripts/register-emitters.ts"
