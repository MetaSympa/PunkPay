import * as bitcoin from 'bitcoinjs-lib';

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest';

export function getNetwork(network?: string): bitcoin.Network {
  switch (network || process.env.BITCOIN_NETWORK || 'signet') {
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    case 'testnet':
    case 'signet':
      return bitcoin.networks.testnet;
    case 'regtest':
      return bitcoin.networks.regtest;
    default:
      return bitcoin.networks.testnet;
  }
}

export function getMempoolApiUrl(network?: string): string {
  const net = network || process.env.BITCOIN_NETWORK || 'signet';
  switch (net) {
    case 'mainnet': return 'https://mempool.space/api';
    case 'testnet': return 'https://mempool.space/testnet/api';
    case 'regtest': return process.env.MEMPOOL_API_URL || 'http://localhost:3000/api'; // local regtest
    case 'signet':
    default:        return 'https://mempool.space/signet/api';
  }
}
