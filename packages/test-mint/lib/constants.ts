// ─── Sui Test NFT ────────────────────────────────────────────────────────────
// Published standalone test_nft package on Sui testnet.

export const TEST_NFT_PACKAGE_ID =
  process.env.NEXT_PUBLIC_TEST_NFT_PACKAGE_ID ||
  "0x4757a80fc0031ef038b96c7818be891f95f67000d127acbdb85cfa2697ef16af";

export const MINT_COUNTER_ID =
  process.env.NEXT_PUBLIC_MINT_COUNTER_ID ||
  "0x3cf1b494daa7ace0edef4052658c2da743d0284abff9bc144bff151346ad74d7";

export const SUI_NETWORK = "testnet";

// ─── NEAR Test NFT ──────────────────────────────────────────────────────────
// Deploy the test-nft contract from packages/near-contracts/test-nft/ to this account.

export const NEAR_TEST_NFT_CONTRACT =
  process.env.NEXT_PUBLIC_NEAR_TEST_NFT_CONTRACT || "ika-test-nft.testnet";

export const NEAR_NETWORK_ID = "testnet";

// ─── Sui Popkins NFT ─────────────────────────────────────────────────────────
// Testnet Popkins-style NFT with randomized traits (mirrors Claynosaurz Popkins structure).

export const POPKINS_PACKAGE_ID =
  process.env.NEXT_PUBLIC_POPKINS_PACKAGE_ID ||
  "0x8d04d6ac1ed8f5aa074d2151c420b97c2e5871fe07a577dfbd310f39dbe6d32a";

export const POPKINS_MINT_COUNTER_ID =
  process.env.NEXT_PUBLIC_POPKINS_MINT_COUNTER_ID ||
  "0x3098fdd4ab47bebe6de87bbbe897c810d34a52e46c3f0250ceacd508b9fe0a15";
