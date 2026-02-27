# Ika Tensei Frontend PRD
## Pixel Otaku Occult - NFT Reincarnation Protocol

### Vision
A JRPG-meets-occult-ritual experience for cross-chain NFT reincarnation. Users seal NFTs on ETH/SUI and reborn them on Solana through a mystical pixel-art ceremony.

### Stack
- Next.js 14 (App Router), React 18, TypeScript
- Tailwind CSS + NES.css (pixel components)
- React Three Fiber + drei + postprocessing (3D with pixel shader)
- Framer Motion (UI) + GSAP (ritual sequences)
- Zustand (state), TanStack Query (data fetching)
- Dynamic.xyz (unified multi-chain wallet)
- use-sound + Tone.js (SFX + ambient)
- Press Start 2P, Silkscreen, Noto Sans JP fonts

### Color Palette
```
--void-purple: #0d0a1a
--ritual-dark: #1a1025  
--card-purple: #231832
--sigil-border: #3a2850
--ghost-white: #e8e0f0
--faded-spirit: #8a7a9a
--blood-pink: #ff3366
--ritual-gold: #ffd700
--mystic-purple: #9b59b6
--spectral-green: #00ff88
--demon-red: #ff4444
--soul-cyan: #00ccff
```

### Pages

#### 1. `/` - Landing (Hero)
- Pixel summoning circle animation (R3F + PixelatePass)
- Ika squid mascot pixel sprite, animated idle
- "イカ転生" title in Press Start 2P
- "Begin the Ritual" CTA button (NES.css styled, blood-pink)
- Stats bar: NFTs Sealed | NFTs Reborn | Chains (pixel counters)
- 3-step explanation with pixel icons (Seal → Reborn → Guild)
- Dark ambient drone on user interaction

#### 2. `/seal` - NFT Selection + Seal Flow
- Connect wallet via Dynamic.xyz (themed pixel modal)
- NFT grid with pixel borders, chain badge on each card
- Click NFT → JRPG dialogue box: "You wish to seal [NFT Name]?"
- Ika mascot portrait changes expression (excited/worried)
- Confirm → Full-screen ritual sequence:
  - Step 1: Runes light up around summoning circle
  - Step 2: NFT descends into circle, pixel flames
  - Step 3: Sigils rotate, key fragments converge (dWallet viz)
  - Step 4: Tarot card flip - Death → The Star
  - Step 5: Reborn NFT revealed in ornate pixel frame
- Progress: RPG HP-bar style (green fill, pixel segments)
- JRPG dialogue narrates each step

#### 3. `/gallery` - Reborn NFTs
- Grid of reborn NFTs in pixel card frames
- Before/After hover comparison
- "Share on Twitter" with pre-filled text
- Filter by collection, chain, date
- Empty state: Ika mascot says "No reborn NFTs yet... begin the ritual?"

#### 4. `/guild` - Adventurer's Guild (DAO)
- RPG guild hall aesthetic
- Voting power display (1 NFT = 1 vote) in pixel counter
- Active proposals in NES.css containers
- Vote buttons styled as RPG action menu
- Treasury view, member leaderboard
- Realms integration under the hood

#### 5. `/profile` - User Profile
- Connected wallets list
- Pending seals with real-time status
- Transaction history (pixel table)
- Settings (sound toggle, reduced motion)

### Components (shared)
- `PixelButton` - NES.css button with occult colors
- `DialogueBox` - JRPG text box with character portrait + typewriter effect
- `PixelCard` - NFT display card with pixel border
- `PixelProgress` - RPG HP bar progress indicator
- `SummoningCircle` - R3F 3D scene with PixelatePass
- `TarotReveal` - Card flip animation (Framer Motion)
- `IkaMascot` - Pixel squid with expression states
- `PixelToast` - Notification toasts in pixel style
- `ChainBadge` - Small pixel icon for ETH/SOL/SUI
- `WalletModal` - Dynamic.xyz wrapper with pixel theme
- `NavBar` - Fixed top nav with pixel styling
- `StatsCounter` - Animated pixel number counter

### File Structure
```
packages/frontend/
├── app/
│   ├── layout.tsx          # Root layout, fonts, providers
│   ├── page.tsx            # Landing
│   ├── seal/page.tsx       # Seal flow
│   ├── gallery/page.tsx    # Reborn gallery
│   ├── guild/page.tsx      # DAO
│   └── profile/page.tsx    # Profile
├── components/
│   ├── ui/                 # Pixel UI primitives
│   ├── three/              # R3F 3D scenes
│   ├── dialogs/            # JRPG dialogue system
│   └── wallet/             # Wallet connection
├── hooks/                  # Custom React hooks
├── stores/                 # Zustand stores
├── lib/                    # Utils, API client, constants
├── styles/                 # Global CSS, NES.css overrides
├── public/
│   ├── fonts/
│   ├── sprites/            # Pixel art assets
│   ├── sounds/             # SFX files
│   └── textures/           # 3D textures
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```
