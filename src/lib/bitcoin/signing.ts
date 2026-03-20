import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork, getMempoolApiUrl } from './networks';

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

export interface InputPath {
  chain: number;
  index: number;
}

/**
 * Sign a PSBT (base64) with a BIP39 mnemonic.
 * Returns the signed raw transaction hex, ready to broadcast.
 */
export async function signPsbt(
  psbtBase64: string,
  mnemonic: string,
  inputPaths: InputPath[],
  addressType: 'P2TR' | 'P2WPKH',
  network: string
): Promise<string> {
  const net = getNetwork(network);
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed, net);
  const accountPath = addressType === 'P2WPKH' ? "m/84'/0'/0'" : "m/86'/0'/0'";
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: net });

  for (let i = 0; i < inputPaths.length; i++) {
    const { chain, index } = inputPaths[i];
    const child = root.derivePath(`${accountPath}/${chain}/${index}`);

    if (addressType === 'P2WPKH') {
      const keyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey!), { network: net });
      psbt.signInput(i, keyPair);
      psbt.finalizeInput(i);
    } else {
      // P2TR key-path spend
      let privKey = Buffer.from(child.privateKey!);
      // If the pubkey has odd parity, negate the private key before tweaking
      if (child.publicKey[0] === 3) {
        privKey = Buffer.from(ecc.privateNegate(privKey));
      }
      const xOnlyPubkey = Buffer.from(child.publicKey.subarray(1, 33));
      const tweak = bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey);
      const tweakedPrivKey = Buffer.from(ecc.privateAdd(privKey, tweak)!);
      const tweakedPubKey = Buffer.from(ecc.pointFromScalar(tweakedPrivKey)!.subarray(1, 33));

      const schnorrSigner = {
        publicKey: tweakedPubKey,
        signSchnorr: (hash: Buffer) => Buffer.from(ecc.signSchnorr(hash, tweakedPrivKey, Buffer.alloc(32))),
      };
      psbt.signInput(i, schnorrSigner as any);
      psbt.finalizeInput(i);
    }
  }

  return psbt.extractTransaction().toHex();
}

/**
 * Broadcast a signed raw transaction hex to the Bitcoin network.
 * Returns the txid on success.
 */
export async function broadcastTx(rawHex: string, network: string): Promise<string> {
  const baseUrl = getMempoolApiUrl(network);
  const res = await fetch(`${baseUrl}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawHex,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Broadcast failed: ${text}`);
  }
  return res.text(); // returns txid
}
