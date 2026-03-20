# PunkPay

A self-custody Bitcoin payment scheduler for cypherpunks. Manage wallets, schedule recurring payments, and run an expense approval workflow — all without giving up your keys.

---

## Features

- **HD Wallet Management** — Create wallets from BIP39 mnemonics or import watch-only xpubs. Supports P2TR (Taproot) and P2WPKH (SegWit).
- **Scheduled Payments** — Automate recurring Bitcoin payments using cron expressions. Auto-signs with stored seed or creates draft transactions for manual signing.
- **Expense Workflow** — Recipients submit expenses; payers approve and pay in sats. Multi-level approval with audit trail.
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

- Node.js 20+
- Docker (for postgres, redis, signal-cli)

---

## Local Setup

### 1. Clone and install

```bash
git clone <repo>
cd punkpay
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```env
# Database
DATABASE_URL=postgresql://punkpay:punkpay_dev@localhost:5432/punkpay

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
AUTH_SECRET=<random-64-char-string>
AUTH_URL=http://localhost:3000

# Bitcoin
BITCOIN_NETWORK=signet
MEMPOOL_API_URL=https://mempool.space/signet/api

# Encryption (AES-256-GCM master key — 64 hex chars)
MASTER_ENCRYPTION_KEY=<64-char-hex-string>

# Signal (optional)
SIGNAL_API_URL=http://localhost:8080
SIGNAL_SENDER_NUMBER=+1234567890
```

### 3. Start infrastructure

```bash
npm run docker:up
```

Starts: **PostgreSQL 16** (5432), **Redis 7** (6379), **Signal CLI** (8080).

### 4. Set up the database

```bash
npm run db:push     # push schema
npm run db:seed     # optional: seed test data
```

### 5. Run the app

Two processes are required in separate terminals:

```bash
# Terminal 1 — web server
npm run dev

# Terminal 2 — background workers
npm run worker
```

Visit **http://localhost:3000**.

---

## Scripts

```bash
npm run dev           # Next.js dev server
npm run build         # Production build
npm start             # Production server
npm run worker        # BullMQ background workers

npm run docker:up     # Start docker containers
npm run docker:down   # Stop docker containers

npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to DB
npm run db:migrate    # Create migration
npm run db:seed       # Seed test data
npm run db:studio     # Open Prisma Studio GUI
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
