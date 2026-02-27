<p align="center">
  <img src="packages/frontend/public/art/ika-mascot-v2.png" width="120" />
</p>

<h1 align="center">イカ転生 - IKA TENSEI</h1>

<p align="center">
  <strong>Resurrect dead NFT collections on Solana. Trustlessly. Community-governed.</strong>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> · <a href="#the-solution">Solution</a> · <a href="#how-it-works">How It Works</a> · <a href="#the-guild">The Guild</a> · <a href="#architecture">Architecture</a> · <a href="#security">Security</a> · <a href="#build">Build</a> · <a href="docs/PRD-v6.md">PRD</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/chains-18_supported-gold?style=flat-square" />
  <img src="https://img.shields.io/badge/verification-Wormhole_13%2F19-blueviolet?style=flat-square" />
  <img src="https://img.shields.io/badge/signing-IKA_2PC--MPC-ff3366?style=flat-square" />
  <img src="https://img.shields.io/badge/destination-Solana_(Metaplex_Core)-9945FF?style=flat-square" />
  <img src="https://img.shields.io/badge/admin_keys-zero-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/audit-58_findings_fixed-orange?style=flat-square" />
</p>

---

## The Problem

Millions of NFTs are trapped on dead chains and in abandoned collections.

The devs rugged. The floor went to zero. The chain got sunset. But the art, the community, the memories still matter to the people who held them.

There is no trustless way to bring them back. Existing bridges are custodial, centralized, or both. They ask you to trust a multisig with your identity. When that team disappears too, you lose everything again.

## The Solution

**Ika Tensei** (イカ転生, "squid reincarnation") is a permissionless protocol that **seals** NFTs on any source chain and **reborns** them on Solana with full on-chain provenance.

No backend. No admin keys. No custodian. Just math.

| What you get | How |
|---|---|
| Cross-chain verification | Wormhole 13/19 guardian consensus attests the seal |
| Threshold signing | IKA Network 2PC-MPC, neither party can sign alone |
| Provenance forever | Original chain, contract, token ID, URI stored on-chain |
| Enforced royalties | Metaplex Core on Solana, royalties baked into the standard |
| Community treasury | The Adventurer's Guild manages funds from trading royalties |

### Supported Source Chains

**EVM:** Ethereum · Polygon · Arbitrum · Base · Optimism · Avalanche · BSC · Fantom · Celo · Moonbeam · Gnosis · Klaytn · Scroll · zkSync

**Other:** Sui · Aptos · NEAR · Solana (old Token Metadata reborn as Metaplex Core)

**Destination:** Solana (Metaplex Core, ~0.003 SOL per mint)

---

## How It Works

```
    YOUR DEAD NFT                                              YOUR REBORN NFT
    on Ethereum                                                on Solana
         |                                                          ^
         v                                                          |
   +-----------+         +-----------+         +-----------+  +------------+
   |  1 SEAL   |-------->| 2 VERIFY  |-------->|  3 SIGN   |->| 4 REBORN   |
   |           |         |           |         |           |  |            |
   | Lock NFT  |  VAA    | Wormhole  |  Proof  | IKA dWallet|  | Metaplex   |
   | Read URI  |-------->| 13/19     |-------->| 2PC-MPC   |->| Core Mint  |
   | Emit msg  |         | consensus |         | threshold |  | Provenance |
   +-----------+         +-----------+         +-----------+  +------------+
    Source Chain            Wormhole               Sui              Solana
```

### Step by Step

**1. Seal** - You connect your wallet and select an NFT from a dead collection. The source chain contract verifies you own it (`ownerOf` / `balanceOf`), reads the `tokenURI`, and publishes a Wormhole message with a packed binary payload.

**2. Verify** - Wormhole's 19 guardian nodes observe the seal transaction. When 13/19 reach consensus, they produce a Verified Action Approval (VAA), a cryptographic attestation that the seal happened.

**3. Sign** - The VAA lands on Sui, where the Orchestrator contract:
- Verifies all 13+ guardian signatures via `wormhole::vaa::parse_and_verify()`
- Validates the emitter address against a per-chain registry
- Constructs a message: `sha256(token_id || token_uri || receiver)`
- Signs it with IKA's shared minting dWallet (2PC-MPC, the key never exists in one place)

**4. Reborn** - The relayer delivers the signature to Solana, where the program:
- Verifies the Ed25519 signature via the native precompile (~900 compute units)
- Creates a Metaplex Core collection for this source collection (if first NFT)
- Mints the reborn NFT to your wallet with full provenance on-chain
- Replay protection via PDA-per-signature (scales indefinitely, fails atomically)

**Total time:** ~2 minutes. **Cost:** ~0.003 SOL. **Trust assumptions:** Wormhole guardians (13/19) + IKA MPC network.

---

## The Guild

The **Adventurer's Guild** gives resurrected collections a community-owned treasury and governance layer built on [Realms](https://realms.today) (SPL Governance).

### How Royalties Flow

Every reborn NFT collection is minted with Metaplex Core royalties baked in at the protocol level: **6.9% total on all trades**, split automatically:

- **72% → DAO Treasury** (~5%) - Controlled by the guild, managed through proposals and votes
- **28% → Protocol** (~1.9%) - Funds protocol development and relayer operations

The treasury is a real Realms DAO on Solana. Each reborn collection gets its own Realm. Guild members (reborn NFT holders) can view the treasury balance, create proposals for how to spend funds, and vote on them through the Council tab in the app.

### What the Treasury Funds

- Gas subsidies for new resurrections
- Marketing and community growth for reborn collections
- Protocol development and infrastructure
- Whatever the guild members vote for

The point: when a collection gets reborn through Ika Tensei, it gets more than new life on Solana. It gets a funded community with real governance through Realms. The original holders had nothing. No devs, no treasury, no roadmap. Now they have all three.

---

## Architecture

```
packages/
├── eth-contracts/      Solidity     SealInitiator (518 LoC) + Forge tests
├── sui-contracts/      Move         Orchestrator, Payload, DWallet Registry (2,329 LoC)
├── solana-program/     Anchor/Rust  IkaTenseiReborn, Metaplex Core CPI (586 LoC)
├── relayer-v6/         TypeScript   Sui->Solana bridge, Borsh encoding (1,229 LoC)
├── frontend/           Next.js      Seal flow UI (32 components)
└── trailer/            Remotion     Promo + demo videos
```

### Key Design Decisions

| Decision | Why |
|---|---|
| `abi.encodePacked` not `abi.encode` | ABI encoding pads to 32 bytes with offset tables. Move has no ABI decoder. Packed binary with fixed offsets is the only cross-chain format that works. |
| Two-phase seal on Sui | IKA 2PC-MPC signing is asynchronous. Transaction 1 verifies the VAA, transaction 2 completes the signature. The relayer bridges them. |
| PDA-per-signature replay | A bounded buffer overflows. PDA-per-signature scales indefinitely. Anchor's `init` constraint fails atomically on replay. Zero maintenance. |
| Ed25519 precompile + sysvar introspection | Solana programs cannot call the precompile directly. Instruction 0 is the Ed25519 verify, instruction 1 reads it from the sysvar and checks all 64 bytes with `constant_time_eq`. |
| DWalletCap burn via transfer | Sui has no `destroy` for arbitrary types. Transfer to `address::from_bytes(object_id)` makes the cap permanently inaccessible. |
| Metaplex Core over Token Metadata | Core has enforced royalties, lower rent, and native collection support. Token Metadata royalties are advisory and routinely bypassed. |
| Sui-side treasury | Holds IKA + SUI tokens for coordinator fees. Uses a withdraw-use-return pattern so signing operations are funded from the protocol treasury, not the user. |

### Wire Format

Cross-chain payload (131+ bytes, no ABI encoding):

```
[0]        u8       payload_type (0x01 = SEAL)
[1-2]      u16      source_chain (big-endian Wormhole chain ID)
[3-34]     bytes32  nft_contract (left-padded)
[35-66]    bytes32  token_id
[67-98]    bytes32  deposit_address (left-padded)
[99-130]   bytes32  receiver (Solana pubkey)
[131+]     bytes    token_uri (raw UTF-8, variable length)
```

Full spec: [`docs/WIRE-FORMAT-SPEC.md`](docs/WIRE-FORMAT-SPEC.md)

---

## Security

3 audit rounds. 12 audit agents. 58 findings total. All critical and high severity fixed.

| Round | Agents | Findings | Result |
|---|---|---|---|
| Round 1 | 4 parallel Sonnet 4.6 | 58 (14 CRITICAL, 12 HIGH) | All fixed by 4 parallel fix agents |
| Round 2 | 4 re-audit agents | 3 new relayer bugs | Fixed |
| Round 3 | Erina (Opus 4.6) | Batch limits, Ed25519 hardening | Fixed |

Score progression: 10/100 → 76/100 → ~85/100

| Property | Implementation |
|---|---|
| Cross-chain verification | Wormhole 13/19 guardian consensus |
| Signing | IKA 2PC-MPC (neither party signs alone) |
| Replay (EVM) | `mapping(bytes32 => bool) sealedNFTs` |
| Replay (Solana) | PDA per `sha256(signature)`, atomic, indefinite |
| Replay (Sui) | `processed_vaas` table + Wormhole `consumed_vaas` |
| Signature verification | Ed25519 precompile, 64-byte constant-time comparison |
| Admin keys (Solana) | None |
| Reentrancy (EVM) | Checks-effects-interactions pattern |

Full report: [`audits/v3/MASTER-AUDIT-V6.md`](audits/v3/MASTER-AUDIT-V6.md)

---

## Build

```bash
# EVM contracts (Foundry)
cd packages/eth-contracts && forge build && forge test

# Sui contracts (requires Wormhole git dependency)
cd packages/sui-contracts/ikatensei && sui move build

# Solana program (Anchor)
cd packages/solana-program/ika-tensei-reborn && anchor build

# Relayer
cd packages/relayer-v6 && npm install && npm run build

# Frontend
cd packages/frontend && npm install && npm run dev
```

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) for Solidity
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) for Move
- [Anchor](https://www.anchor-lang.com/) + [Solana CLI](https://docs.solanalabs.com/cli/install) for Rust
- Node.js 18+ for Relayer + Frontend

---

## Docs

| Document | Description |
|---|---|
| [PRD v6](docs/PRD-v6.md) | Full protocol spec, Fesal's architecture |
| [Wire Format Spec](docs/WIRE-FORMAT-SPEC.md) | Canonical byte-level cross-chain payload format |
| [Subagent Rules](docs/SUBAGENT-RULES.md) | Dev guidelines: no stubs, no custom serialization |
| [Audit Report](audits/v3/MASTER-AUDIT-V6.md) | 3-round security audit, 58 findings, all fixes documented |

---

## The Name

転生 (*tensei*) means reincarnation in Japanese. In anime and manga, *isekai tensei* stories follow characters who die and are reborn in another world, carrying memories of their past life.

That is exactly what happens here. Your NFT dies on one chain and is reborn on another, carrying its full history, its provenance, its art, its identity, into a new life on Solana.

イカ (*ika*) means squid. Because [IKA Network](https://ika.xyz) is the cryptographic backbone that makes trustless cross-chain signing possible.

🦑

---

<p align="center">
  <strong>Built for the <a href="https://www.colosseum.org/renaissance">Solana Graveyard Hackathon</a></strong>
</p>

<p align="center">
  <a href="https://ika.xyz">IKA Network</a> · <a href="https://wormhole.com">Wormhole</a> · <a href="https://metaplex.com">Metaplex</a>
</p>

<p align="center">
  <sub>MIT License · 2026</sub>
</p>
