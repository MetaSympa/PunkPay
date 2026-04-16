import { z } from 'zod';

// Bitcoin address validation — supports P2TR (bc1p) and P2WPKH (bc1q) for mainnet, testnet, signet, regtest
export const btcAddressRegex = /^(bc1[pq]|tb1[pq]|bcrt1[pq])[a-z0-9]{38,64}$/;
const xpubRegex = /^[xt]pub[1-9A-HJ-NP-Za-km-z]{100,120}$/;

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  totpCode: z.string().length(6).optional(),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  role: z.enum(['PAYER', 'RECIPIENT']).default('RECIPIENT'),
});

export const importXpubSchema = z.object({
  name: z.string().min(1).max(100),
  xpub: z.string().regex(xpubRegex, 'Invalid xpub format'),
  network: z.enum(['mainnet', 'testnet', 'signet', 'regtest']).default('mainnet'),
  addressType: z.literal('P2TR').default('P2TR'),
});

export const sendPaymentSchema = z.object({
  walletId: z.string().cuid(),
  recipientAddress: z.string().regex(btcAddressRegex, 'Invalid Taproot address'),
  amountSats: z.coerce.bigint().positive('Amount must be positive'),
  feeRate: z.number().positive().max(1000, 'Fee rate too high'),
});

export const createScheduleSchema = z.object({
  walletId: z.string().cuid(),
  recipientAddress: z.string().regex(btcAddressRegex, 'Invalid Taproot address').optional(),
  recipientXpub: z.string().min(50).optional(),
  recipientName: z.string().max(100).optional(),
  amountSats: z.coerce.bigint().positive(),
  cronExpression: z.string().min(9).max(100),
  timezone: z.string().default('UTC'),
  maxFeeRate: z.number().positive().default(50),
  rbfEnabled: z.boolean().default(false),
}).refine(d => d.recipientAddress || d.recipientXpub, {
  message: 'Either recipientAddress or recipientXpub is required',
});

export const submitExpenseSchema = z.object({
  amount: z.coerce.bigint().positive(),
  description: z.string().min(1).max(1000),
  category: z.string().max(50).optional(),
  recipientAddress: z.string().regex(btcAddressRegex, 'Invalid Taproot address'),
  receiptUrl: z.string().url().optional(),
});

export const approveExpenseSchema = z.object({
  action: z.enum(['approve', 'reject']),
  walletId: z.string().cuid().optional(), // hot wallet for auto-broadcast on approve
});

export const feeBumpSchema = z.object({
  txid: z.string().length(64),
  newFeeRate: z.number().positive(),
});
