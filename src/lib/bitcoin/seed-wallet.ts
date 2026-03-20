import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork } from './networks';

const bip32 = BIP32Factory(ecc);
bitcoin.initEccLib(ecc);

/**
 * Generate a fresh BIP39 12-word mnemonic
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128); // 128 bits = 12 words
}

/**
 * Validate a BIP39 mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

/**
 * Get the correct coin_type for a network per BIP44
 * mainnet = 0, testnet/signet/regtest = 1
 */
function getCoinType(network?: string): number {
  const net = network || process.env.BITCOIN_NETWORK || 'mainnet';
  return net === 'mainnet' ? 0 : 1;
}

/**
 * Derive the BIP86 account-level xpub from a mnemonic
 * Path: m/86'/coin_type'/0'  where coin_type = 0 (mainnet) or 1 (testnet/signet)
 */
export async function mnemonicToXpub(
  mnemonic: string,
  network?: string,
  passphrase?: string
): Promise<string> {
  const net = getNetwork(network);
  const coinType = getCoinType(network);
  const seed = await bip39.mnemonicToSeed(mnemonic.trim().toLowerCase(), passphrase || '');
  const root = bip32.fromSeed(seed, net);
  const accountNode = root.derivePath(`m/86'/${coinType}'/0'`);
  return accountNode.neutered().toBase58();
}
