# PunkPay

A self-custody Bitcoin payment scheduler for cypherpunks. Manage wallets, schedule recurring payments, and run an expense approval workflow — all without giving up your keys.

---

## Features

- **HD Wallet Management** — Create wallets from BIP39 mnemonics or import watch-only xpubs. Supports P2TR (Taproot) and P2WPKH (SegWit).
- **Scheduled Payments** — Automate recurring Bitcoin payments using cron expressions. Auto-signs with stored seed or creates draft transactions for manual signing.
- **Expense Workflow** — Recipients submit expenses; payers approve and pay in sats. Multi-level approval with a
udit trail.
- **UTXO Management** — Syncs UTXOs from Mempool.space, handles UTXO locking to prevent double-spends, and supports fee-bumping via RBF.
- **Multi-user Roles** — `PAYER` (fund wallets, create schedules) and `RECIPIENT` (submit expenses, set xpub for fresh receive addresses).
- **2FA** — TOTP-based two-factor authentication.
- **Signal Notifications** — Payment status alerts via Signal messenger.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS 4, React Query |
| Backend | Next.js API routes, Prisma 6, PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Bitcoin | bitcoinjs-lib, bip32, bip39, tiny-secp256k1 |
| Auth | NextAuth.js v5, Argon2, TOTP |
| Encryption | AES-256-GCM |
| Blockchain data | Mempool.space API |
| Notifications | Signal CLI REST API |

---

## Prerequisites

- Docker + Docker Compose

That's it. No local Node.js required for the fully-containerized setup.

> For local development (hot reload), you also need Node.js 20+.

---

## Quickstart — Full Docker (recommended)

Everything — frontend, API, workers, Postgres, Redis, Signal CLI — runs in containers.

### 1. Clone

```bash
git clone <repo>
cd punkpay
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the secrets. The infra URLs (`DATABASE_URL`, `REDIS_URL`, `SIGNAL_API_URL`) are automatically overridden by Docker Compose to use container hostnames — you only need to set them for local dev:

```env
# NextAuth — keep as localhost (browser-facing)
AUTH_SECRET=<random-secret>        # openssl rand -base64 32
AUTH_URL=http://localhost:3000

# Bitcoin (Mutinynet Signet for testing)
BITCOIN_NETWORK=signet
MEMPOOL_API_URL=https://mutinynet.com/api
MEMPOOL_WS_URL=wss://mutinynet.com/api/v1/ws

# Encryption — 64 hex chars
MASTER_ENCRYPTION_KEY=<hex-key>    # openssl rand -hex 32

# Signal (optional)
SIGNAL_SENDER_NUMBER=+1234567890
```

### 3. Build and start

```bash
npm run docker:up:full
```

This builds the images and starts all 5 services. The `app` container automatically runs `prisma db push` before booting, so the schema is always up to date.

Visit **http://localhost:3000**.

### 4. Watch logs

```bash
npm run docker:logs          # app + worker logs
docker compose logs -f       # all services
```

### 5. Stop

```bash
npm run docker:down
```

---

## Local Development (hot reload)

Run infra in Docker, app + worker on your machine.

### 1. Start infra only

```bash
npm run docker:up            # starts postgres, redis, signal-cli only
```

### 2. Configure environment

Copy `.env.example` to `.env`. Use the local dev URLs:

```env
DATABASE_URL=postgresql://punkpay:punkpay_dev@localhost:5433/punkpay
REDIS_URL=redis://localhost:6379
AUTH_URL=http://localhost:3000
BITCOIN_NETWORK=signet
MEMPOOL_API_URL=https://mutinynet.com/api
MEMPOOL_WS_URL=wss://mutinynet.com/api/v1/ws
AUTH_SECRET=<random-secret>
MASTER_ENCRYPTION_KEY=<64-char-hex>
SIGNAL_API_URL=http://localhost:8080
SIGNAL_SENDER_NUMBER=+1234567890
```

> Note: Postgres is mapped to port **5433** to avoid conflicts with any local Postgres instance.

### 3. Set up the database

```bash
npm install
npm run db:push     # push schema
npm run db:seed     # optional: seed test data
```

### 4. Run the app

```bash
# Terminal 1 — web server (hot reload)
npm run dev

# Terminal 2 — background workers
npm run worker
```

Visit **http://localhost:3000**.

---

## Scripts

```bash
# Docker
npm run docker:build      # Build app + worker images
npm run docker:up         # Start all containers (no rebuild)
npm run docker:up:full    # Build images then start all containers
npm run docker:down       # Stop all containers
npm run docker:logs       # Tail app + worker logs

# Dev
npm run dev               # Next.js dev server (hot reload)
npm run worker            # BullMQ background workers
npm run build             # Production build
npm start                 # Production server

# Database
npm run db:generate       # Generate Prisma client
npm run db:push           # Push schema to DB
npm run db:migrate        # Create migration
npm run db:seed           # Seed test data
npm run db:studio         # Open Prisma Studio GUI
```

---

## Background Workers

The worker process (`npm run worker`) runs four BullMQ queues:

| Worker | What it does |
|---|---|
| Payment | Executes scheduled payments — builds PSBT, auto-signs if seed is present, broadcasts |
| UTXO Sync | Fetches and upserts UTXOs from Mempool.space for all wallet addresses |
| TX Monitor | Polls blockchain for confirmations, marks UTXOs as spent |
| Notification | Sends Signal messages for payment status updates |

Active schedules are synced every 30 seconds. The worker shuts down gracefully on `SIGINT`/`SIGTERM`.

---

## Database Models

`User` · `Wallet` · `Address` · `Utxo` · `Transaction` · `PaymentSchedule` · `Expense` · `AuditLog`

View or edit data via Prisma Studio:

```bash
npm run db:studio
```

---

## Security Notes

- Wallet seeds and xpubs are encrypted at rest with AES-256-GCM using a master key.
- Passwords are hashed with Argon2id.
- All actions are written to an audit log.
- Rate limiting and CSRF protection on API routes.
- UTXOs are locked during transaction building to prevent double-spends.
