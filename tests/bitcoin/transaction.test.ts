import { describe, it, expect, beforeAll } from 'vitest';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import {
  estimateTxSize,
  calculateFee,
  buildPsbt,
  buildRbfPsbt,
  serializePsbt,
  deserializePsbt,
} from '../../src/lib/bitcoin/transaction';
import { deriveAddress } from '../../src/lib/bitcoin/hd-wallet';

// BIP86 xpub derived from the standard "abandon x11 about" test mnemonic on signet.
// Never use this key for real funds.
const TEST_XPUB =
  'tpubDC5FSnBiZDMmhiuCmWAYsLwgLYrrT9rAqvTySfuCCrgsWz8wxMXUS9Tb9iVMvcRbvFcAHGkMD5Kx8koh4GquNGNTfohfk7pgjhaPCdXpoba';

const BTC_NETWORK = bitcoin.networks.testnet; // signet uses testnet params

beforeAll(() => {
  bitcoin.initEccLib(ecc);
});

function scriptPubKeyFor(address: string): string {
  return Buffer.from(bitcoin.address.toOutputScript(address, BTC_NETWORK)).toString('hex');
}

function testAddr(chain: 0 | 1, index: number) {
  return deriveAddress(TEST_XPUB, chain, index, 'signet', 'P2TR');
}

describe('estimateTxSize', () => {
  it('1 input, 2 outputs (standard send + change)', () => {
    // 10.5 + 1*58 + 2*43 = 154.5 → ceil = 155
    expect(estimateTxSize(1, 2)).toBe(155);
  });

  it('2 inputs, 2 outputs', () => {
    // 10.5 + 2*58 + 2*43 = 212.5 → ceil = 213
    expect(estimateTxSize(2, 2)).toBe(213);
  });

  it('1 input, 1 output (no change — dust swept)', () => {
    // 10.5 + 58 + 43 = 111.5 → ceil = 112
    expect(estimateTxSize(1, 1)).toBe(112);
  });

  it('scales linearly with inputs', () => {
    const base = estimateTxSize(1, 2);
    const two  = estimateTxSize(2, 2);
    expect(two - base).toBe(58); // one more P2TR input = 58 vbytes
  });
});

describe('calculateFee', () => {
  it('returns a BigInt', () => {
    expect(typeof calculateFee(1, 2, 10)).toBe('bigint');
  });

  it('1 input, 2 outputs at 10 sat/vb', () => {
    // ceil(155 * 10) = 1550
    expect(calculateFee(1, 2, 10)).toBe(1550n);
  });

  it('2 inputs, 2 outputs at 5 sat/vb', () => {
    // ceil(213 * 5) = 1065
    expect(calculateFee(2, 2, 5)).toBe(1065n);
  });

  it('fee scales with fee rate', () => {
    const low  = calculateFee(1, 2, 1);
    const high = calculateFee(1, 2, 10);
    expect(high).toBe(low * 10n);
  });

  it('minimum fee is at least 1 sat at rate 1', () => {
    expect(calculateFee(1, 1, 1)).toBeGreaterThan(0n);
  });
});

describe('buildPsbt', () => {
  it('produces a PSBT with the correct number of inputs and outputs', () => {
    const recipient = testAddr(0, 0);
    const change    = testAddr(1, 0);
    const psbt = buildPsbt(
      [{ txid: 'a'.repeat(64), vout: 0, valueSats: 100_000n, scriptPubKey: scriptPubKeyFor(recipient.address) }],
      [
        { address: recipient.address, valueSats: 50_000n },
        { address: change.address,    valueSats: 48_000n },
      ],
      'signet',
    );
    expect(psbt.data.inputs).toHaveLength(1);
    expect(psbt.data.outputs).toHaveLength(2);
  });

  it('sets RBF sequence (0xFFFFFFFD) by default', () => {
    const addr = testAddr(0, 0);
    const psbt = buildPsbt(
      [{ txid: 'b'.repeat(64), vout: 0, valueSats: 50_000n, scriptPubKey: scriptPubKeyFor(addr.address) }],
      [{ address: addr.address, valueSats: 49_000n }],
      'signet',
    );
    expect(psbt.txInputs[0].sequence).toBe(0xfffffffd);
  });

  it('sets FINAL sequence when RBF disabled', () => {
    const addr = testAddr(0, 0);
    const psbt = buildPsbt(
      [{ txid: 'c'.repeat(64), vout: 0, valueSats: 50_000n, scriptPubKey: scriptPubKeyFor(addr.address) }],
      [{ address: addr.address, valueSats: 49_000n }],
      'signet',
      false,
    );
    expect(psbt.txInputs[0].sequence).toBe(0xffffffff);
  });
});

describe('PSBT serialization roundtrip', () => {
  it('serializePsbt → deserializePsbt produces identical PSBT', () => {
    const addr = testAddr(0, 1);
    const original = buildPsbt(
      [{ txid: 'd'.repeat(64), vout: 0, valueSats: 20_000n, scriptPubKey: scriptPubKeyFor(addr.address) }],
      [{ address: addr.address, valueSats: 19_000n }],
      'signet',
    );
    const b64       = serializePsbt(original);
    const recovered = deserializePsbt(b64, 'signet');

    expect(typeof b64).toBe('string');
    expect(recovered.data.inputs).toHaveLength(1);
    expect(recovered.data.outputs).toHaveLength(1);
    expect(serializePsbt(recovered)).toBe(b64);
  });
});

describe('buildRbfPsbt', () => {
  it('reduces change output to absorb the higher fee', () => {
    const recipient = testAddr(0, 2);
    const change    = testAddr(1, 1);
    const input     = { txid: 'e'.repeat(64), vout: 0, valueSats: 100_000n, scriptPubKey: scriptPubKeyFor(recipient.address) };

    const lowFee  = buildRbfPsbt([input], recipient.address, 50_000n, change.address, 5,  'signet');
    const highFee = buildRbfPsbt([input], recipient.address, 50_000n, change.address, 20, 'signet');

    const lowChange  = lowFee.txOutputs.find(o => o.address === change.address)?.value  ?? 0n;
    const highChange = highFee.txOutputs.find(o => o.address === change.address)?.value ?? 0n;
    expect(highChange).toBeLessThan(lowChange);
  });

  it('omits change output when it falls at or below P2TR dust (330 sats)', () => {
    const recipient = testAddr(0, 2);
    const change    = testAddr(1, 1);
    // amount = 99_500, fee at 20 sat/vb ≈ 2600 sats → change is negative → drop
    const input = { txid: 'f'.repeat(64), vout: 0, valueSats: 100_000n, scriptPubKey: scriptPubKeyFor(recipient.address) };
    const psbt  = buildRbfPsbt([input], recipient.address, 99_500n, change.address, 20, 'signet');
    expect(psbt.txOutputs.some(o => o.address === change.address)).toBe(false);
  });

  it('preserves the recipient output at the original amount', () => {
    const recipient = testAddr(0, 2);
    const change    = testAddr(1, 1);
    const input     = { txid: '1'.repeat(64), vout: 0, valueSats: 100_000n, scriptPubKey: scriptPubKeyFor(recipient.address) };
    const psbt      = buildRbfPsbt([input], recipient.address, 50_000n, change.address, 10, 'signet');
    const out = psbt.txOutputs.find(o => o.address === recipient.address);
    expect(out?.value).toBe(50_000n);
  });
});
