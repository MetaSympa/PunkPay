import { describe, it, expect } from 'vitest';
import { selectUtxos } from '../../src/lib/bitcoin/utxo';

function utxo(txid: string, vout: number, sats: bigint) {
  return { txid, vout, valueSats: sats };
}

describe('selectUtxos', () => {
  describe('selection logic', () => {
    it('selects the single UTXO that covers amount + fee', () => {
      const utxos = [utxo('aa', 0, 10_000n)];
      const { selected, totalSats } = selectUtxos(utxos, 5_000n, 1_000n);
      expect(selected).toHaveLength(1);
      expect(totalSats).toBe(10_000n);
    });

    it('selects largest UTXOs first (greedy largest-first)', () => {
      const utxos = [
        utxo('aa', 0, 1_000n),
        utxo('bb', 0, 50_000n),
        utxo('cc', 0, 5_000n),
      ];
      const { selected } = selectUtxos(utxos, 10_000n, 500n);
      // Only the 50_000 sat UTXO is needed
      expect(selected).toHaveLength(1);
      expect(selected[0].txid).toBe('bb');
    });

    it('accumulates multiple UTXOs when none is large enough alone', () => {
      const utxos = [
        utxo('aa', 0, 3_000n),
        utxo('bb', 0, 3_000n),
        utxo('cc', 0, 3_000n),
      ];
      // need 8_000 + 500 = 8_500; three × 3_000 = 9_000 ✓
      const { selected, totalSats } = selectUtxos(utxos, 8_000n, 500n);
      expect(selected).toHaveLength(3);
      expect(totalSats).toBe(9_000n);
    });

    it('stops as soon as the running total meets the target', () => {
      const utxos = [
        utxo('aa', 0, 100_000n),
        utxo('bb', 0, 50_000n),
        utxo('cc', 0, 20_000n),
      ];
      // 100_000 alone covers 90_000 + 1_000
      const { selected } = selectUtxos(utxos, 90_000n, 1_000n);
      expect(selected).toHaveLength(1);
    });

    it('handles exact match (amount + fee == total input)', () => {
      const utxos = [utxo('aa', 0, 10_000n)];
      const { selected, totalSats } = selectUtxos(utxos, 9_500n, 500n);
      expect(selected).toHaveLength(1);
      expect(totalSats).toBe(10_000n);
    });
  });

  describe('insufficient funds', () => {
    it('throws when wallet is empty', () => {
      expect(() => selectUtxos([], 1_000n, 100n)).toThrow('Insufficient funds');
    });

    it('throws when total UTXOs < amount + fee', () => {
      const utxos = [utxo('aa', 0, 500n), utxo('bb', 0, 400n)];
      expect(() => selectUtxos(utxos, 800n, 200n)).toThrow('Insufficient funds');
    });

    it('error message includes have/need amounts', () => {
      const utxos = [utxo('aa', 0, 1_000n)];
      expect(() => selectUtxos(utxos, 2_000n, 500n)).toThrow(/have 1000 sats.*need 2500 sats/);
    });

    it('throws when fee alone exceeds balance', () => {
      const utxos = [utxo('aa', 0, 100n)];
      expect(() => selectUtxos(utxos, 0n, 500n)).toThrow('Insufficient funds');
    });
  });

  describe('chained unconfirmed UTXOs', () => {
    it('treats unconfirmed UTXOs the same as confirmed (selection is value-only)', () => {
      // The caller already filters by status before calling selectUtxos
      const utxos = [utxo('unconf_change', 1, 8_000n)];
      const { selected } = selectUtxos(utxos, 5_000n, 500n);
      expect(selected[0].txid).toBe('unconf_change');
    });
  });
});
