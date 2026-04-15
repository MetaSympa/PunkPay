# ─── Base ─────────────────────────────────────────────────────────────────────
# Alpine + native build tools (needed for argon2, tiny-secp256k1)
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
# Install all deps (dev+prod) and generate Prisma client for Linux
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# ─── Builder ──────────────────────────────────────────────────────────────────
# Build the Next.js app; dummy env vars satisfy validation without a real DB
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    REDIS_URL="redis://localhost:6379" \
    AUTH_SECRET="build-time-placeholder-minimum-32-chars!!" \
    MASTER_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
    BITCOIN_NETWORK="signet"
RUN npm run build

# ─── App (Next.js frontend + API routes) ──────────────────────────────────────
FROM node:20-alpine AS app
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# node_modules with Linux-native binaries (argon2, prisma engine, etc.)
COPY --from=deps /app/node_modules ./node_modules
# Next.js build output
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public
# Prisma schema needed for db push at startup
COPY --from=builder /app/prisma ./prisma
# Config files needed by `next start`
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/package*.json ./

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npx", "next", "start", "-H", "0.0.0.0"]

# ─── Worker (BullMQ payment/sync/monitor/notification) ────────────────────────
FROM node:20-alpine AS worker
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package*.json ./

CMD ["npx", "tsx", "src/workers/index.ts"]
