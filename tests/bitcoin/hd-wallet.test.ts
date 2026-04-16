import { describe, it, expect } from 'vitest';
import { deriveAddress, deriveAddresses, validateXpub, getXpubFingerprint } from '../../src/lib/bitcoin/hd-wallet';

// BIP86 xpub derived from "abandon x11 about" mnemonic on testnet/signet (coin_type=1).
// These are well-known test vectors — never use for real funds.
const TESTNET_XPUB =
  'tpubDC5FSnBiZDMmhiuCmWAYsLwgLYrrT9rAqvTySfuCCrgsWz8wxMXUS9Tb9iVMvcRbvFcAHGkMD5Kx8koh4GquNGNTfohfk7pgjhaPCdXpoba';

describe('deriveAddress', () => {
  describe('P2TR (Taproot)', () => {
    it('returns a string address', () => {
      const { address } = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR');
      expect(typeof address).toBe('string');
    });

    it('produces a bech32m address (starts with tb1p on testnet/signet)', () => {
      const { address } = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR');
      expect(address).toMatch(/^tb1p/);
    });

    it('is deterministic — same inputs always produce same address', () => {
      const a = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR').address;
      const b = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR').address;
      expect(a).toBe(b);
    });

    it('different indices produce different addresses', () => {
      const a0 = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR').address;
      const a1 = deriveAddress(TESTNET_XPUB, 0, 1, 'signet', 'P2TR').address;
      expect(a0).not.toBe(a1);
    });

    it('external (chain=0) and internal (chain=1) produce different addresses', () => {
      const ext = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR').address;
      const int = deriveAddress(TESTNET_XPUB, 1, 0, 'signet', 'P2TR').address;
      expect(ext).not.toBe(int);
    });

    it('returns a 32-byte pubkey', () => {
      const { pubkey } = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR');
      expect(pubkey).toHaveLength(33); // compressed pubkey (x-coord + parity byte)
    });

    it('returns the correct derivation path string', () => {
      const { path } = deriveAddress(TESTNET_XPUB, 1, 5, 'signet', 'P2TR');
      expect(path).toBe('1/5');
    });
  });

  describe('P2WPKH (Native SegWit)', () => {
    it('produces a bech32 address (starts with tb1q on testnet/signet)', () => {
      const { address } = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2WPKH');
      expect(address).toMatch(/^tb1q/);
    });

    it('P2WPKH and P2TR at same index produce different addresses', () => {
      const taproot  = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2TR').address;
      const segwit   = deriveAddress(TESTNET_XPUB, 0, 0, 'signet', 'P2WPKH').address;
      expect(taproot).not.toBe(segwit);
    });
  });
});

describe('deriveAddresses', () => {
  it('returns exactly count addresses', () => {
    const addrs = deriveAddresses(TESTNET_XPUB, 0, 0, 5, 'signet', 'P2TR');
    expect(addrs).toHaveLength(5);
  });

  it('index fields match startIndex + offset', () => {
    const addrs = deriveAddresses(TESTNET_XPUB, 0, 3, 4, 'signet', 'P2TR');
    expect(addrs.map(a => a.index)).toEqual([3, 4, 5, 6]);
  });

  it('all addresses are unique', () => {
    const addrs = deriveAddresses(TESTNET_XPUB, 0, 0, 20, 'signet', 'P2TR');
    const unique = new Set(addrs.map(a => a.address));
    expect(unique.size).toBe(20);
  });

  it('matches individual deriveAddress calls', () => {
    const batch  = deriveAddresses(TESTNET_XPUB, 0, 0, 3, 'signet', 'P2TR');
    const single = [0, 1, 2].map(i => deriveAddress(TESTNET_XPUB, 0, i, 'signet', 'P2TR').address);
    expect(batch.map(a => a.address)).toEqual(single);
  });
});

describe('validateXpub', () => {
  it('accepts a valid testnet xpub', () => {
    expect(validateXpub(TESTNET_XPUB, 'signet')).toBe(true);
  });

  it('rejects garbage strings', () => {
    expect(validateXpub('notanxpub', 'signet')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateXpub('', 'signet')).toBe(false);
  });

  it('rejects a mainnet xpub when validating for testnet', () => {
    const mainnetXpub =
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC1fy93fGtW2WLBTgDwZHLcdnmNB8nKqpQyaFuF8ozpSjmXcTPMnvhMCKtJbkCmMoXxCUMo37ZZFW';
    expect(validateXpub(mainnetXpub, 'signet')).toBe(false);
  });
});

describe('getXpubFingerprint', () => {
  it('returns a string with ... in the middle', () => {
    const fp = getXpubFingerprint(TESTNET_XPUB);
    expect(fp).toContain('...');
  });

  it('starts with the first 8 chars of the xpub', () => {
    const fp = getXpubFingerprint(TESTNET_XPUB);
    expect(fp.startsWith(TESTNET_XPUB.slice(0, 8))).toBe(true);
  });

  it('ends with the last 8 chars of the xpub', () => {
    const fp = getXpubFingerprint(TESTNET_XPUB);
    expect(fp.endsWith(TESTNET_XPUB.slice(-8))).toBe(true);
  });
});
