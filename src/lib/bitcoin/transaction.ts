import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { getNetwork } from './networks';

bitcoin.initEccLib(ecc);

// RBF sequence number (enables replace-by-fee)
const RBF_SEQUENCE = 0xfffffffd;
// Final sequence number (no replacement allowed)
const FINAL_SEQUENCE = 0xffffffff;

export interface PsbtInput {
  txid: string;
  vout: number;
  valueSats: bigint;
  scriptPubKey: string;
  tapInternalKey?: Buffer; // required for P2TR key-path signing
}

export interface PsbtOutput {
  address: string;
  valueSats: bigint;
}

/**
 * Estimate transaction size for fee calculation
 * P2TR input: ~58 vbytes, P2TR output: ~43 vbytes, overhead: ~10.5 vbytes
 */
export function estimateTxSize(numInputs: number, numOutputs: number): number {
  return Math.ceil(10.5 + numInputs * 58 + numOutputs * 43);
}

/**
 * Calculate fee in satoshis
 */
export function calculateFee(numInputs: number, numOutputs: number, feeRate: number): bigint {
  const vsize = estimateTxSize(numInputs, numOutputs);
  return BigInt(Math.ceil(vsize * feeRate));
}

/**
 * Build an unsigned PSBT for a Taproot transaction
 */
export function buildPsbt(
  inputs: PsbtInput[],
  outputs: PsbtOutput[],
  network?: string,
  rbfEnabled = true
): bitcoin.Psbt {
  const net = getNetwork(network);
  const psbt = new bitcoin.Psbt({ network: net });

  for (const input of inputs) {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      sequence: rbfEnabled ? RBF_SEQUENCE : FINAL_SEQUENCE,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, 'hex'),
        value: input.valueSats,
      },
      ...(input.tapInternalKey ? { tapInternalKey: input.tapInternalKey } : {}),
    });
  }

  for (const output of outputs) {
    psbt.addOutput({
      address: output.address,
      value: output.valueSats,
    });
  }

  return psbt;
}

/**
 * Build a fee-bump replacement transaction (RBF)
 * Uses the same inputs but with a higher fee
 */
export function buildRbfPsbt(
  inputs: PsbtInput[],
  recipientAddress: string,
  amountSats: bigint,
  changeAddress: string,
  newFeeRate: number,
  network?: string
): bitcoin.Psbt {
  const fee = calculateFee(inputs.length, 2, newFeeRate);
  const totalInput = inputs.reduce((sum, i) => sum + i.valueSats, 0n);
  const change = totalInput - amountSats - fee;

  const outputs: PsbtOutput[] = [
    { address: recipientAddress, valueSats: amountSats },
  ];

  if (change > 330n) { // Taproot dust threshold (P2TR = 330 sats)
    outputs.push({ address: changeAddress, valueSats: change });
  }

  return buildPsbt(inputs, outputs, network);
}

/**
 * Serialize PSBT to base64 string
 */
export function serializePsbt(psbt: bitcoin.Psbt): string {
  return psbt.toBase64();
}

/**
 * Deserialize PSBT from base64 string
 */
export function deserializePsbt(base64: string, network?: string): bitcoin.Psbt {
  const net = getNetwork(network);
  return bitcoin.Psbt.fromBase64(base64, { network: net });
}

/**
 * Extract raw transaction hex from a finalized PSBT
 */
export function extractRawTx(psbt: bitcoin.Psbt): string {
  return psbt.extractTransaction().toHex();
}
