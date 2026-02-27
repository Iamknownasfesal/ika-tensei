# Ika Tensei v6 Relayer

Permissionless relayer service for the Ika Tensei NFT reincarnation protocol. This relayer bridges Sui `SealSigned` events to Solana, submitting `mint_reborn` transactions.

## Overview

The v6 relayer is a stateless, permissionless service that:

1. **Subscribes** to `SealSigned` events on Sui (orchestration layer)
2. **Parses** the event data (signature, dWallet pubkey, NFT metadata)
3. **Submits** transactions to Solana calling `mint_reborn`
4. **Retries** on transient failures with exponential backoff

## Architecture

```
┌─────────────┐                 ┌─────────────────┐             ┌──────────────────┐
│ Source Chain│──Wormhole VAA──>│  Sui Contract   │  Relayer    │ Solana Program   │
│  (EVM/Move) │                 │ (Orchestrator)  │────────────>│ (mint_reborn)    │
└─────────────┘                 └─────────────────┘             └──────────────────┘
       │                               │                               │
       │                        SealSigned event                  Mint NFT to
       │                        (signature + data)               receiver
```

## Requirements

- Node.js 22+
- npm 10+

## Installation

```bash
# Install dependencies
cd packages/relayer-v6
npm install --legacy-peer-deps
```

## Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:

| Variable | Description | Example |
|----------|-------------|---------|
| `SUI_RPC_URL` | Sui RPC endpoint | `https://sui-testnet-rpc.example.com` |
| `SUI_WS_URL` | Sui WebSocket endpoint | `wss://sui-testnet-ws.example.com` |
| `SUI_PACKAGE_ID` | Sui orchestrator package ID | `0x1234...` |
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.testnet.solana.com` |
| `SOLANA_PROGRAM_ID` | Solana program ID | `REBORN...` |
| `RELAYER_KEYPAIR_PATH` | Path to relayer keypair JSON | `./relayer-keypair.json` |

### Generating a Relayer Keypair

The relayer needs a Solana keypair to sign transactions. Generate one:

```bash
# Using Solana CLI
solana-keygen new -o relayer-keypair.json

# Or programmatically in Node.js
const { Keypair } = require('@solana/web3.js');
const keypair = Keypair.generate();
console.log(JSON.stringify(Array.from(keypair.secretKey)));
```

## Development

```bash
# Start in development mode (watch mode)
npm run dev

# Build TypeScript
npm run build

# Type check without emitting
npm run typecheck
```

## Production

### Local

```bash
# Build and start
npm run build
npm start
```

### Docker

```bash
# Build the image
docker build -t ika-tensei-relayer-v6 .

# Run the container
docker run -d \
  --name relayer-v6 \
  -p 8080:8080 \
  -v ./relayer-keypair.json:/app/relayer-keypair.json:ro \
  --env-file .env \
  ika-tensei-relayer-v6
```

### Docker Compose

```yaml
version: '3.8'

services:
  relayer:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./relayer-keypair.json:/app/relayer-keypair.json:ro
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Health Check

The relayer exposes a health endpoint at `/health`:

```bash
curl http://localhost:8080/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": 1700000000000,
  "suiConnected": true,
  "solanaConnected": true,
  "eventsProcessed": 42,
  "eventsFailed": 0
}
```

## Monitoring

### Logs

Logs are output in JSON format (production) or pretty-printed (development):

```bash
# Development
npm run dev

# Production with Pino Pretty
LOG_LEVEL=info NODE_ENV=development npm start

# Production JSON logs
NODE_ENV=production npm start
```

### Metrics to Monitor

- **Events processed**: Successful relay count
- **Events failed**: Failed relay count
- **Sui connection**: WebSocket connection status
- **Solana connection**: RPC connection status
- **Transaction latency**: Time from event to Solana confirmation

## Properties

- **Permissionless**: Anyone can run a relayer. The relayer cannot modify signed data.
- **Stateless**: No database required. Just event subscription and transaction submission.
- **Resilient**: Auto-reconnects on Sui WebSocket drops.
- **Idempotent**: Solana program handles replay protection via signature tracking.

## Troubleshooting

### Sui Connection Issues

```bash
# Check Sui RPC
curl -s <SUI_RPC_URL> | jq

# Check WebSocket
wscat -c <SUI_WS_URL>
```

### Solana Transaction Failures

Check the logs for specific error messages. Common issues:

- **Insufficient funds**: Relayer needs SOL for transaction fees
- **Invalid signature**: Check the relayer keypair is correct
- **Program not found**: Verify `SOLANA_PROGRAM_ID` is correct

### High Failure Rate

- Check network connectivity
- Verify RPC endpoints are not rate-limited
- Ensure the relayer keypair has sufficient SOL balance

## Security Considerations

1. **Keypair Security**: The relayer keypair should have minimal SOL needed for fees
2. **Network Security**: Use TLS for RPC endpoints in production
3. **Rate Limiting**: Consider adding rate limiting for health endpoints
4. **Monitoring**: Set up alerts for failure rates and connection status

## License

MIT
