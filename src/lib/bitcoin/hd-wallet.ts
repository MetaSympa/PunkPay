import BIP32Factory, { BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork } from './networks';

const bip32 = BIP32Factory(ecc);

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

export type AddressType = 'P2TR' | 'P2WPKH';

/**
 * Derive a BIP86 Taproot (P2TR) or BIP84 Native SegWit (P2WPKH) address from an xpub
 */
export function deriveAddress(
  xpub: string,
  chain: 0 | 1, // 0 = external (receive), 1 = internal (change)
  index: number,
  network?: string,
  addressType: AddressType = 'P2TR'
): { address: string; pubkey: Uint8Array; path: string } {
  const net = getNetwork(network);
  const node = bip32.fromBase58(xpub, net);
  const child = node.derive(chain).derive(index);

  let address: string | undefined;

  if (addressType === 'P2WPKH') {
    const payment = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(child.publicKey), network: net });
    address = payment.address;
  } else {
    // P2TR: Taproot uses x-only pubkey (32 bytes, drop the first byte)
    const xOnlyPubkey = child.publicKey.subarray(1, 33);
    const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: net });
    address = payment.address;
  }

  if (!address) throw new Error(`Failed to derive ${addressType} address`);

  return {
    address,
    pubkey: child.publicKey,
    path: `${chain}/${index}`,
  };
}

/**
 * Derive a batch of addresses
 */
export function deriveAddresses(
  xpub: string,
  chain: 0 | 1,
  startIndex: number,
  count: number,
  network?: string,
  addressType: AddressType = 'P2TR'
): Array<{ address: string; pubkey: Uint8Array; path: string; index: number }> {
  const addresses = [];
  for (let i = 0; i < count; i++) {
    const idx = startIndex + i;
    const derived = deriveAddress(xpub, chain, idx, network, addressType);
    addresses.push({ ...derived, index: idx });
  }
  return addresses;
}

/**
 * Validate an xpub string
 */
export function validateXpub(xpub: string, network?: string): boolean {
  try {
    const net = getNetwork(network);
    bip32.fromBase58(xpub, net);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get xpub fingerprint (first 8 chars) for identification
 */
export function getXpubFingerprint(xpub: string): string {
  return xpub.slice(0, 8) + '...' + xpub.slice(-8);
}
