import * as bitcoin from 'bitcoinjs-lib';

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest';

export function getNetwork(network?: string): bitcoin.Network {
  switch (network || process.env.BITCOIN_NETWORK || 'mainnet') {
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
  // Always allow env override first
  if (process.env.MEMPOOL_API_URL) return process.env.MEMPOOL_API_URL;

  const net = network || process.env.BITCOIN_NETWORK || 'mainnet';
  switch (net) {
    case 'mainnet': return 'https://mempool.space/api';
    case 'testnet': return 'https://mempool.space/testnet/api';
    case 'regtest': return 'http://localhost:3000/api';
    case 'signet':
    default:        return 'https://mempool.space/api';
  }
}
