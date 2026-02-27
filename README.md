<p align="center">
  <img src="packages/frontend/public/art/ika-mascot-v2.png" width="140" />
</p>

<h1 align="center">イカ転生 — IKA TENSEI</h1>

<p align="center">
  <em>Your NFT died. We brought it back.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/source-Base_·_Ethereum_·_NEAR_·_Sui-gold?style=for-the-badge" />
  <img src="https://img.shields.io/badge/destination-Solana-9945FF?style=for-the-badge" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/signing-IKA_2PC--MPC_dWallet-ff3366?style=for-the-badge" />
  <img src="https://img.shields.io/badge/governance-Realms_DAO-blueviolet?style=for-the-badge" />
  <img src="https://img.shields.io/badge/royalties-Metaplex_Core_6.9%25-00ccff?style=for-the-badge" />
</p>

<br/>

<p align="center">
  <a href="#the-graveyard">The Graveyard</a> · <a href="#the-ritual">The Ritual</a> · <a href="#the-guild">The Guild</a> · <a href="#the-machine">The Machine</a> · <a href="#the-road-to-trustless">The Road to Trustless</a> · <a href="#build">Build</a>
</p>

---

<br/>

## The Graveyard

There are millions of dead NFTs.

Rugged projects. Sunset chains. Abandoned collections. The devs disappeared, the floor hit zero, the Discord went silent. But the art is still there. The metadata is still pinned. The community still remembers.

There is no way to bring them back. The few "bridges" that exist are custodial wrappers. You trust a multisig to hold your identity on one chain and issue an IOU on another. When that team disappears too (and they always do), you lose everything. Again.

**Ika Tensei** (イカ転生, "squid reincarnation") fixes this.

Seal your dead NFT on any chain. Get a real, first-class Metaplex Core NFT on Solana. Full provenance on-chain. Enforced royalties. And a funded DAO for your community to govern.

Not a wrapped token. Not an IOU. A reborn identity.

<br/>

## The Ritual

> _Connect. Seal. Reborn._

```
  DEAD NFT                                                          REBORN NFT
  Base, Ethereum,                                                   Solana
  NEAR, Sui                                                         (Metaplex Core)

       |                                                                 ^
       v                                                                 |
  ┌─────────┐       ┌──────────┐       ┌──────────┐       ┌─────────────┐
  │  SEAL   │──────>│  VERIFY  │──────>│   SIGN   │──────>│   REBORN    │
  │         │       │          │       │          │       │             │
  │ Deposit │  RPC  │ Relayer  │  Sui  │ IKA      │  Sol  │ Metaplex    │
  │ to      │──────>│ confirms │──────>│ dWallet  │──────>│ Core mint   │
  │ dWallet │       │ ownership│       │ 2PC-MPC  │       │ + Realm DAO │
  └─────────┘       └──────────┘       └──────────┘       └─────────────┘
```

### The Six Steps

**① Pay + dWallet Creation**
Connect your Solana wallet. Pay a small seal fee. The protocol creates a fresh IKA deposit dWallet on the source chain. That address belongs to the protocol's shared minting authority, split across IKA's MPC network. Nobody holds the full key.

**② Deposit Your NFT**
Transfer your NFT to the deposit address. The relayer's chain verifier detects the deposit and identifies the token ID automatically. No manual input needed. Works for ERC-721, ERC-1155, Sui objects, and NEAR NEP-171.

**③ Metadata Preservation**
The relayer fetches the original metadata from the source chain (name, image, attributes, everything), wraps it with reborn provenance data (source chain, contract, token ID, deposit tx), and uploads the combined metadata to Arweave. Permanent. Immutable. The art and history survive the chain death.

**④ Seal on Sui**
The orchestrator contract on Sui creates a `PendingSeal`. The seal signer coordinates with IKA's 2PC-MPC network using the shared minting dWallet. The key never exists in one place. The signature is produced collaboratively. `SealSigned` event fires.

**⑤ Reborn on Solana**
The Ed25519 signature lands on Solana. The program verifies it via the native precompile (~900 compute units). A Metaplex Core collection is created for this source collection (if first). Your reborn NFT is minted with full provenance stored on-chain. Royalties are set at **6.9%**, enforced at the protocol level.

**⑥ Realm DAO Created**
First NFT from a collection? The protocol spins up a full [Realms](https://realms.today) DAO. Treasury. Governance. NFT-weighted voting. All live from the moment of the first rebirth. The dead collection now has infrastructure it never had when it was alive.

> **~2 minutes. ~0.003 SOL. 4 source chains (14+ on mainnet). One reborn identity.**

<br/>

---

<br/>

## The Guild

This is where Ika Tensei stops being "just a bridge" and becomes something different.

Most cross-chain NFT solutions give you a wrapped token and call it a day. We give you **a funded community with real governance**. Every reborn collection gets its own DAO, powered by [Realms](https://realms.today), Solana's battle-tested governance framework used by hundreds of DAOs in production.

### Automatic DAO Creation

The moment the first NFT from any collection is reborn, the protocol creates:

| Component          | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| **Realm**          | A dedicated SPL Governance realm for the collection               |
| **NativeTreasury** | A treasury wallet that accumulates royalties from every trade     |
| **Governance**     | Configurable voting (60% threshold, 3-day voting period)          |
| **Council**        | Protocol-level emergency governance (parameter changes, upgrades) |
| **ika-core-voter** | Custom voter weight plugin for NFT-based voting                   |

No setup. No governance bootstrapping. No token launches. The infrastructure is live before the second NFT is even minted.

### NFT-Weighted Voting

Standard Realms uses fungible token voting. That doesn't work for NFT communities because there is no token to distribute. So we built **`ika-core-voter`**, a custom Realms voter weight plugin for Metaplex Core assets.

```
┌──────────────────────────────────────────────────────┐
│                  ika-core-voter                       │
│                                                      │
│  Registrar                                           │
│  ├── Collection: 0xABC... (Reborn Azuki)  weight: 1 │
│  ├── Collection: 0xDEF... (Reborn BAYC)   weight: 1 │
│  └── (up to 10 collections per registrar)            │
│                                                      │
│  On vote:                                            │
│  1. Holder calls update_voter_weight_record          │
│  2. Passes Core asset accounts as remaining_accounts │
│  3. Program verifies on-chain:                       │
│     ✓ Owned by Metaplex Core program                 │
│     ✓ AssetV1 key type                               │
│     ✓ Voter is the owner                             │
│     ✓ Asset belongs to registered collection         │
│     ✗ Duplicate assets rejected                      │
│  4. VoterWeightRecord expires after current slot     │
│  5. Record passed to Realms for the actual vote      │
│                                                      │
│  Result: 1 NFT = 1 vote. Always live.                │
│  Sell your NFT? Lose your vote. Buy more? More power.│
│  No staking. No lockups. No delegation complexity.   │
└──────────────────────────────────────────────────────┘
```

### Royalty-Funded Treasuries

Every reborn collection mints with **6.9% Metaplex Core royalties**, enforced at the protocol level (not advisory, not bypassable):

```
  Every Trade
      │
      ▼
  6.9% royalty
      │
      ├── 72% ──▶ Collection's Realm NativeTreasury (~5.0%)
      │           Controlled by NFT holders through Realms proposals
      │
      └── 28% ──▶ Protocol Treasury (~1.9%)
                  Funds relayer operations and development
```

The treasury address is **deterministic**. It's derived from the collection name _before_ the first mint happens. PDA chain: `realm_name → realm → governance → native_treasury`. Royalties route correctly from the very first trade.

### What Treasuries Fund

Guild members create proposals through Realms to spend treasury funds. Some ideas:

- 🔥 Gas subsidies for more resurrections in the same collection
- 📢 Marketing and community growth campaigns
- 🛠 Bounties for collection-specific tools or integrations
- 🎨 Commission new art or experiences for the reborn community
- Literally anything the DAO votes for

### The Real Difference

|                    | Traditional Bridge | Ika Tensei                                     |
| ------------------ | ------------------ | ---------------------------------------------- |
| What you get       | Wrapped token      | First-class Metaplex Core NFT                  |
| Provenance         | Maybe a memo field | Full on-chain (chain, contract, token ID, URI) |
| Royalties          | None or advisory   | 6.9% enforced, protocol-level                  |
| Community treasury | None               | Auto-funded from every trade                   |
| Governance         | None               | Realms DAO with NFT voting                     |
| When devs leave    | You're stuck again | DAO runs itself                                |

When a dead collection gets reborn, the holders don't just get their art back. They get a treasury that grows with every trade, governance to decide how it's spent, and a voting system that works with the NFTs they already hold. The original collection had none of this.

<br/>

---

<br/>

## The Machine

### Repository Structure

```
packages/
├── eth-contracts/      Solidity      SealInitiator (EVM source chains)
├── sui-contracts/      Move          Orchestrator · DWallet Registry · Treasury · Signing
├── solana-program/     Anchor/Rust   IkaTenseiReborn (Metaplex Core CPI) · ika-core-voter
├── near-contracts/     Rust          NEAR SealInitiator
├── aptos-contracts/    Move          Aptos SealInitiator
├── relayer-v6/         TypeScript    Orchestration service (10 subsystems)
├── frontend/           Next.js       Seal flow · Gallery · Guild UI
├── test-mint/          Next.js       Test minting for EVM/Sui/NEAR
└── trailer/            Remotion      Promo + demo videos
```

### Relayer Subsystems

The relayer orchestrates the entire flow. Ten subsystems, one process:

| Subsystem            | Role                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **API Server**       | Express API: seal sessions, payment confirmation, NFT detection, guild/treasury endpoints        |
| **Chain Verifier**   | Verifies NFT ownership on Base, Ethereum, Sui, NEAR via RPC (Aptos + more EVM chains on mainnet) |
| **NFT Detector**     | Auto-discovers token IDs at deposit addresses                                                    |
| **Metadata Handler** | Fetches source metadata, transforms with provenance, uploads to Arweave                          |
| **Seal Signer**      | Coordinates IKA 2PC-MPC signing with the shared minting dWallet                                  |
| **Solana Submitter** | Submits `mint_reborn` with Ed25519 signature to Solana                                           |
| **Realm Creator**    | Spins up Realms DAOs, configures ika-core-voter plugin                                           |
| **VAA Ingester**     | (Phase 1) Polls Wormholescan for guardian-attested VAAs                                          |
| **Treasury Manager** | Maintains IKA/SUI balances for signing coordinator fees                                          |
| **Presign Pool**     | Pre-generates signing nonces for sub-second seal completion                                      |

Plus: rate limiting, per-wallet session caps, atomic status transitions, TOCTOU re-verification, Sui transaction queue (serialized shared object access), session expiry, health endpoint.

### Design Decisions

| Decision                              | Rationale                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Centralized relayer (hackathon)**   | Ship fast, prove the full flow, decentralize in phases                                                                                         |
| **IKA dWallet for signing**           | Minting key never exists in one place, even in centralized mode                                                                                |
| **`create_centralized_seal`**         | Same Sui contract, same events, same downstream flow. Bypasses Wormhole for speed.                                                             |
| **PDA-per-signature replay**          | Scales indefinitely. Anchor `init` fails atomically on replay. Zero maintenance.                                                               |
| **Ed25519 via sysvar introspection**  | Solana programs can't call the precompile directly. Instruction 0 verifies, instruction 1 reads from sysvar. 64-byte constant-time comparison. |
| **Metaplex Core over Token Metadata** | Enforced royalties (not advisory). Lower rent. Native collection support.                                                                      |
| **Realms + custom voter plugin**      | Battle-tested governance. NFT voting without token launches.                                                                                   |
| **Sui-side treasury**                 | Withdraw-use-return pattern. Users never pay coordinator fees.                                                                                 |

### Wire Format

Cross-chain payload (packed binary, no ABI encoding):

```
Offset    Type      Field
──────    ────      ─────
[0]       u8        payload_type (0x01 = SEAL)
[1-2]     u16       source_chain (big-endian Wormhole chain ID)
[3-34]    bytes32   nft_contract (left-padded)
[35-66]   bytes32   token_id
[67-98]   bytes32   deposit_address (left-padded)
[99-130]  bytes32   receiver (Solana pubkey)
[131+]    bytes     token_uri (raw UTF-8, variable length)
```

Why packed binary? `abi.encode` pads to 32 bytes with offset tables. Move has no ABI decoder. Fixed offsets are the only cross-chain format that works without chain-specific decoders.

Full spec: [`docs/WIRE-FORMAT-SPEC.md`](docs/WIRE-FORMAT-SPEC.md)

<br/>

---

<br/>

## The Road to Trustless

The hackathon version is centralized on purpose. A single relayer verifies deposits, coordinates signing, and submits transactions. Fast to build, easy to debug, lets us handle the wild variety of metadata formats across chains.

But the contracts are already built for the trustless version. The Sui orchestrator has both entry points: `process_vaa` (Wormhole-verified) and `create_centralized_seal` (relayer-authorized). The Solana program verifies Ed25519 signatures regardless of origin. **Switching from centralized to decentralized does not require redeploying contracts.**

### Decentralization Phases

| Phase         | Trust Model                       | Change                                                                                                                                                                                                      |
| ------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Now**       | Relayer verifies via RPC          | Single operator. Fast iteration. Easy debugging.                                                                                                                                                            |
| **Phase 1**   | Wormhole 13/19 guardian consensus | SealInitiator contracts emit Wormhole messages. VAA Ingester (already built) polls Wormholescan, submits `process_vaa`. Relayer becomes a relay, not a verifier.                                            |
| **Phase 2**   | Permissionless relaying           | Remove AdminCap. Anyone calls `process_vaa` with a valid VAA. Relayer competition.                                                                                                                          |
| **Phase 2.5** | 14+ source chains                 | Deploy SealInitiator contracts to Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Celo, Moonbeam, Gnosis, Klaytn, Scroll, zkSync, Aptos. Contracts are written, just need deployment + relayer config. |
| **Phase 3**   | No single point of failure        | Multiple relayers. MEV protection. On-chain fee market. Community infrastructure.                                                                                                                           |

### What's Already Trust-Minimized

Even in the centralized flow, the relayer **cannot forge signatures**. The minting authority is an IKA dWallet split between the relayer's key share and IKA's MPC network via 2PC-MPC. Neither party can sign alone. The relayer coordinates the ceremony, but it cannot unilaterally mint.

What centralization buys: speed, simplicity, the ability to handle edge cases (metadata formats vary wildly) without governance overhead.

What decentralization buys: censorship resistance, liveness guarantees, and the ability to say "this runs even if we disappear."

> `ENABLE_VAA_INGESTER=true` activates Phase 1. The code is written. The contracts are deployed. The switch is a config flag.

<br/>

---

<br/>

## Build

```bash
# EVM (Foundry)
cd packages/eth-contracts && forge build && forge test

# Sui (requires Wormhole git dependency)
cd packages/sui-contracts/ikatensei && sui move build

# Solana (Anchor)
cd packages/solana-program/ika-tensei-reborn && anchor build

# Voter Plugin
cd packages/solana-program/ika-core-voter && anchor build

# Relayer
cd packages/relayer-v6 && npm install && npm run build

# Frontend
cd packages/frontend && npm install && npm run dev
```

**Requires:** [Foundry](https://book.getfoundry.sh/) · [Sui CLI](https://docs.sui.io/) · [Anchor](https://www.anchor-lang.com/) · [Solana CLI](https://docs.solanalabs.com/cli/install) · Node.js 18+

<br/>

---

<br/>

## The Name

転生 (_tensei_) means reincarnation. In Japanese manga, _isekai tensei_ stories follow characters who die and are reborn in another world, carrying memories of their past life.

That is exactly what happens here. Your NFT dies on one chain and is reborn on another. It carries its history, its provenance, its art, its identity into a new life on Solana.

イカ (_ika_) means squid. [IKA Network](https://ika.xyz) is the cryptographic backbone that makes cross-chain signing possible without trusting anyone.

🦑

<br/>

---

<p align="center">
  <strong>Built for the <a href="https://www.colosseum.org/renaissance">Solana Graveyard Hackathon</a></strong>
</p>

<p align="center">
  <a href="https://ika.xyz">IKA Network</a> · <a href="https://wormhole.com">Wormhole</a> · <a href="https://metaplex.com">Metaplex</a> · <a href="https://realms.today">Realms</a>
</p>

<p align="center">
  <sub>MIT License · 2026</sub>
</p>
