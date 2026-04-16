import { describe, it, expect, beforeAll } from 'vitest';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import { signPsbt } from '../../src/lib/bitcoin/signing';
import { deriveAddress } from '../../src/lib/bitcoin/hd-wallet';
import { buildPsbt, serializePsbt, calculateFee } from '../../src/lib/bitcoin/transaction';

// Standard BIP39 test mnemonic — never use for real funds
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const NETWORK = 'signet';
const BTC_NETWORK = bitcoin.networks.testnet; // signet uses testnet network params

// Derived in beforeAll — matches exactly what signPsbt will derive (m/86'/1'/0')
let TEST_XPUB = '';

beforeAll(async () => {
  const bip32 = BIP32Factory(ecc);
  bitcoin.initEccLib(ecc);
  const seed    = await bip39.mnemonicToSeed(TEST_MNEMONIC);
  const root    = bip32.fromSeed(seed, BTC_NETWORK);
  TEST_XPUB     = root.derivePath("m/86'/1'/0'").neutered().toBase58();
});

function scriptPubKeyFor(address: string): string {
  return Buffer.from(bitcoin.address.toOutputScript(address, BTC_NETWORK)).toString('hex');
}

describe('signPsbt — P2TR', () => {
  it('produces a valid lowercase hex string', async () => {
    const sender    = deriveAddress(TEST_XPUB, 0, 0, NETWORK, 'P2TR');
    const recipient = deriveAddress(TEST_XPUB, 0, 1, NETWORK, 'P2TR');
    const change    = deriveAddress(TEST_XPUB, 1, 0, NETWORK, 'P2TR');

    const inputValue = 100_000n;
    const fee        = calculateFee(1, 2, 10);

    const psbt = buildPsbt(
      [{
        txid: 'a'.repeat(64),
        vout: 0,
        valueSats: inputValue,
        scriptPubKey: scriptPubKeyFor(sender.address),
        tapInternalKey: Buffer.from(sender.pubkey).subarray(1, 33),
      }],
      [
        { address: recipient.address, valueSats: 40_000n },
        { address: change.address,    valueSats: inputValue - 40_000n - fee },
      ],
      NETWORK,
    );

    const rawHex = await signPsbt(serializePsbt(psbt), TEST_MNEMONIC, [{ chain: 0, index: 0 }], 'P2TR', NETWORK);

    expect(typeof rawHex).toBe('string');
    expect(rawHex).toMatch(/^[0-9a-f]+$/);
    // 1-in-2-out Taproot tx is ~170 bytes
    expect(rawHex.length).toBeGreaterThan(200);
  });

  it('produces a parseable transaction with correct input/output counts', async () => {
    const sender    = deriveAddress(TEST_XPUB, 0, 0, NETWORK, 'P2TR');
    const recipient = deriveAddress(TEST_XPUB, 0, 2, NETWORK, 'P2TR');
    const change    = deriveAddress(TEST_XPUB, 1, 0, NETWORK, 'P2TR');
    const fee       = calculateFee(1, 2, 5);

    const psbt = buildPsbt(
      [{
        txid: 'b'.repeat(64),
        vout: 0,
        valueSats: 200_000n,
        scriptPubKey: scriptPubKeyFor(sender.address),
        tapInternalKey: Buffer.from(sender.pubkey).subarray(1, 33),
      }],
      [
        { address: recipient.address, valueSats: 100_000n },
        { address: change.address,    valueSats: 200_000n - 100_000n - fee },
      ],
      NETWORK,
    );

    const rawHex = await signPsbt(serializePsbt(psbt), TEST_MNEMONIC, [{ chain: 0, index: 0 }], 'P2TR', NETWORK);
    const tx = bitcoin.Transaction.fromHex(rawHex);

    expect(tx.ins).toHaveLength(1);
    expect(tx.outs).toHaveLength(2);
  });

  it('signs a 2-input transaction correctly', async () => {
    const sender0   = deriveAddress(TEST_XPUB, 0, 0, NETWORK, 'P2TR');
    const sender1   = deriveAddress(TEST_XPUB, 0, 1, NETWORK, 'P2TR');
    const recipient = deriveAddress(TEST_XPUB, 0, 2, NETWORK, 'P2TR');
    const change    = deriveAddress(TEST_XPUB, 1, 0, NETWORK, 'P2TR');
    const fee       = calculateFee(2, 2, 10);

    const psbt = buildPsbt(
      [
        {
          txid: 'c'.repeat(64), vout: 0, valueSats: 50_000n,
          scriptPubKey: scriptPubKeyFor(sender0.address),
          tapInternalKey: Buffer.from(sender0.pubkey).subarray(1, 33),
        },
        {
          txid: 'd'.repeat(64), vout: 0, valueSats: 50_000n,
          scriptPubKey: scriptPubKeyFor(sender1.address),
          tapInternalKey: Buffer.from(sender1.pubkey).subarray(1, 33),
        },
      ],
      [
        { address: recipient.address, valueSats: 80_000n },
        { address: change.address,    valueSats: 100_000n - 80_000n - fee },
      ],
      NETWORK,
    );

    const rawHex = await signPsbt(
      serializePsbt(psbt),
      TEST_MNEMONIC,
      [{ chain: 0, index: 0 }, { chain: 0, index: 1 }],
      'P2TR',
      NETWORK,
    );
    const tx = bitcoin.Transaction.fromHex(rawHex);

    expect(tx.ins).toHaveLength(2);
    expect(tx.outs).toHaveLength(2);
  });

  it('P2TR key-path witness is a single 64-byte Schnorr signature (SIGHASH_DEFAULT)', async () => {
    const sender    = deriveAddress(TEST_XPUB, 0, 0, NETWORK, 'P2TR');
    const recipient = deriveAddress(TEST_XPUB, 0, 3, NETWORK, 'P2TR');
    const fee       = calculateFee(1, 1, 10);

    const psbt = buildPsbt(
      [{
        txid: 'e'.repeat(64),
        vout: 0,
        valueSats: 50_000n,
        scriptPubKey: scriptPubKeyFor(sender.address),
        tapInternalKey: Buffer.from(sender.pubkey).subarray(1, 33),
      }],
      [{ address: recipient.address, valueSats: 50_000n - fee }],
      NETWORK,
    );

    const rawHex = await signPsbt(serializePsbt(psbt), TEST_MNEMONIC, [{ chain: 0, index: 0 }], 'P2TR', NETWORK);
    const tx     = bitcoin.Transaction.fromHex(rawHex);
    const witness = tx.ins[0].witness;

    expect(witness).toHaveLength(1);
    expect(witness[0].length).toBe(64); // SIGHASH_DEFAULT = 64 bytes (no extra byte)
  });

  it('chained spend: output of first tx is input of second', async () => {
    const sender    = deriveAddress(TEST_XPUB, 0, 0, NETWORK, 'P2TR');
    const recipient = deriveAddress(TEST_XPUB, 0, 1, NETWORK, 'P2TR');
    const change    = deriveAddress(TEST_XPUB, 1, 0, NETWORK, 'P2TR');
    const fee       = calculateFee(1, 2, 10);

    // TX1: spend a funding UTXO, produce change at chain=1 index=0
    const tx1Psbt = buildPsbt(
      [{
        txid: 'f'.repeat(64), vout: 0, valueSats: 100_000n,
        scriptPubKey: scriptPubKeyFor(sender.address),
        tapInternalKey: Buffer.from(sender.pubkey).subarray(1, 33),
      }],
      [
        { address: recipient.address, valueSats: 40_000n },
        { address: change.address,    valueSats: 100_000n - 40_000n - fee },
      ],
      NETWORK,
    );
    const tx1Hex  = await signPsbt(serializePsbt(tx1Psbt), TEST_MNEMONIC, [{ chain: 0, index: 0 }], 'P2TR', NETWORK);
    const tx1     = bitcoin.Transaction.fromHex(tx1Hex);
    const tx1id   = tx1.getId();
    const changeValue = tx1.outs[1].value; // BigInt

    // TX2: spend the change output from TX1
    const tx2Psbt = buildPsbt(
      [{
        txid: tx1id, vout: 1, valueSats: changeValue,
        scriptPubKey: scriptPubKeyFor(change.address),
        tapInternalKey: Buffer.from(change.pubkey).subarray(1, 33),
      }],
      [{ address: recipient.address, valueSats: changeValue - calculateFee(1, 1, 10) }],
      NETWORK,
    );
    const tx2Hex = await signPsbt(serializePsbt(tx2Psbt), TEST_MNEMONIC, [{ chain: 1, index: 0 }], 'P2TR', NETWORK);
    const tx2    = bitcoin.Transaction.fromHex(tx2Hex);

    expect(Buffer.from(tx2.ins[0].hash).reverse().toString('hex')).toBe(tx1id);
    expect(tx2.ins[0].index).toBe(1);
  });
});
