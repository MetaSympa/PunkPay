# PunkPay — Project Memory

> Self-custody Bitcoin payment scheduler for cypherpunks. v0.1.0-alpha, **Mainnet**.

## Stack

- **Frontend:** Next.js 16, React 19, TailwindCSS 4, React Query, custom cyberpunk UI components
- **Backend:** Next.js API routes (App Router), Prisma 6, PostgreSQL 16
- **Queue:** BullMQ + Redis 7 (4 workers: payment, utxo-sync, tx-monitor, notification)
- **Bitcoin:** bitcoinjs-lib, bip32, bip39, tiny-secp256k1 — Taproot (P2TR) + SegWit (P2WPKH)
- **Auth:** NextAuth v5, Argon2, TOTP (otpauth)
- **Encryption:** AES-256-GCM double-layer (master key + user key for seeds)
- **Notifications:** Signal CLI REST API
- **Infra:** Docker Compose (postgres, redis, signal-cli)

## Directory Layout

```
src/
├── app/
│   ├── api/              # 15+ API routes
│   │   ├── auth/         # register, [...nextauth]
│   │   ├── wallet/       # CRUD, unlock, sync, generate-mnemonic, create-from-seed
│   │   ├── transactions/ # CRUD, broadcast
│   │   ├── schedules/    # CRUD
│   │   ├── expenses/     # CRUD, approve
│   │   ├── recipients/   # list
│   │   ├── recipient/    # derive, profile
│   │   ├── fees/         # fee estimation
│   │   └── utxos/        # UTXO listing
│   ├── (auth)/           # login, register pages
│   ├── (dashboard)/      # overview, wallet, wallet/[id], schedules, expenses, transactions
│   └── recipient/        # recipient-facing page
├── components/
│   ├── ui/               # glitch-text, terminal-card, stat-display, ascii-art, loading-spinner, matrix-rain, neon-button
│   ├── expenses/         # expense-list, expense-form, approval-card
│   ├── schedules/        # schedule-list, schedule-form
│   ├── transactions/     # tx-list, tx-detail
│   └── onboarding-flow.tsx
├── hooks/                # use-wallet, use-schedules, use-expenses, use-transactions, use-utxo-sync
├── lib/
│   ├── bitcoin/          # hd-wallet, seed-wallet, signing, transaction, utxo, sync, networks, config
│   ├── auth/             # config, edge-config, totp
│   ├── crypto/           # encryption (AES-256-GCM, double encrypt/decrypt)
│   ├── validation/       # zod schemas
│   ├── scheduler/        # cron/payment scheduling
│   ├── signal/           # Signal messenger integration
│   ├── db.ts             # Prisma client singleton
│   ├── env.ts            # env validation
│   ├── api-utils.ts      # shared API helpers
│   └── theme-context.tsx # dark/light theme
├── workers/
│   └── index.ts          # BullMQ worker entry (payment, utxo-sync, tx-monitor, notification)
└── types/
    └── next-auth.d.ts
prisma/
├── schema.prisma         # 10 models: User, Wallet, Address, Utxo, Transaction, RecipientProfile, PaymentSchedule, Expense, AuditLog + enums
└── seed.ts
```

## Key Models (Prisma)

- **User** — email, passwordHash (Argon2), role (PAYER/RECIPIENT/ADMIN), TOTP, signalNumber
- **Wallet** — encryptedXpub, encryptedSeed (optional), derivationPath, addressType (P2TR/P2WPKH), network
- **Address** — wallet child, chain (EXTERNAL/INTERNAL), index, isUsed
- **Utxo** — txid:vout, valueSats (BigInt), status (UNCONFIRMED/CONFIRMED/SPENT/LOCKED), isLocked, lockedUntil
- **Transaction** — PSBT, rawHex, type, status (DRAFT→SIGNED→BROADCAST→CONFIRMED/FAILED/REPLACED), RBF support
- **PaymentSchedule** — cronExpression, recipientAddress/Xpub, amountSats, maxFeeRate, isActive
- **Expense** — submitter/approver, amount, status (PENDING→APPROVED/REJECTED→PAID), recipientAddress
- **AuditLog** — action, entity, entityId, metadata (JSON), ipAddress

## Bitcoin Details

- Taproot dust threshold: 330 sats
- RBF sequence: 0xFFFFFFFD
- TX size estimation: 10.5 overhead + 58/input + 43/output vbytes
- UTXO sync via Mempool.space API
- PSBT-based workflow: build → sign → finalize → broadcast

## Design System

- Cyberpunk/terminal aesthetic: neon-green, neon-amber, neon-red, cyber-bg, cyber-surface, cyber-border, cyber-text, cyber-muted
- Custom components: GlitchText, NeonButton, TerminalCard, AsciiLogo, MatrixRain, StatDisplay, LoadingSpinner
- Font: mono throughout
- Responsive: desktop sidebar + mobile bottom nav

## Dev Commands

```bash
npm run dev          # Next.js dev
npm run worker       # BullMQ workers
npm run docker:up    # postgres + redis + signal
npm run db:push      # push schema
npm run db:seed      # seed data
npm run db:studio    # Prisma Studio
```

## Fixed Issues

- **Worker decrypt failure (2026-03-20):** "Unsupported state or unable to authenticate data" — worker (tsx) loaded MASTER_ENCRYPTION_KEY with quotes from .env while Next.js stripped them. Fix: removed quotes from .env + added `dotenv/config` import to worker.

## Known Gaps (as of 2026-03-20)

- **No tests** — zero test files
- **No rate limiting middleware** — claimed in README but not implemented
- **No key rotation** — single master encryption key
- **No multi-sig** — single-key signing only
- **No hardware wallet** — no Ledger/Trezor integration
- **No Lightning** — on-chain only
- **Running on mainnet** — extra caution needed for all Bitcoin changes
