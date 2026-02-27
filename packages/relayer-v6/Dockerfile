# Ika Tensei v6 Relayer Dockerfile
#
# Production-ready Docker image for the permissionless relayer

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S relayer && \
    adduser -S relayer -u 1001

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy environment file template
COPY .env.example ./.env

# Keypairs will be mounted as volumes in production

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set ownership
RUN chown -R relayer:relayer /app

# Switch to non-root user
USER relayer

# Expose API port + health check port
EXPOSE 3001 8080

# Volume for persistent data (SQLite DB)
VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the relayer
CMD ["node", "dist/index.js"]
