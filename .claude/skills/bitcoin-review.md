---
name: bitcoin-review
description: Validate Bitcoin transaction construction, fee logic, address derivation, and UTXO management
---

# Bitcoin Review Skill

Review Bitcoin-related code in the PunkPay codebase:

## Checks to perform:

1. **Address Derivation** — Verify BIP86 compliance, correct key tweaking for Taproot, proper x-only pubkey handling
2. **Transaction Construction** — Validate PSBT inputs/outputs, witness structure, proper Taproot signing
3. **Fee Calculation** — Check fee estimation logic, dust threshold handling, change output logic
4. **RBF Implementation** — Verify sequence numbers (0xFFFFFFFD), replacement transaction construction
5. **UTXO Management** — Check for double-spend prevention, proper locking, status transitions
6. **Network Handling** — Verify signet/testnet/mainnet address format handling
7. **Amount Handling** — Check for integer overflow, proper BigInt usage for satoshi amounts
8. **Error Handling** — Verify graceful handling of insufficient funds, broadcast failures, invalid addresses

## Files to review:
- src/lib/bitcoin/*.ts
- src/lib/scheduler/handlers.ts
- src/app/api/wallet/*.ts
- src/app/api/transactions/*.ts
