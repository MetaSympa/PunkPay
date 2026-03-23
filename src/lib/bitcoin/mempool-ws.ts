import WebSocket from 'ws';
import { getMempoolWsUrl } from './networks';

export type WalletActivityCallback = (walletId: string, addresses: string[]) => void;

const INITIAL_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;  // cap at 1 min
const RESUBSCRIBE_DEBOUNCE_MS = 300;

/**
 * Manages a single persistent WebSocket connection to mempool.space for one network.
 * Tracks address→walletId subscriptions and fires onActivity when mempool or confirmed
 * transactions appear on any watched address.
 *
 * Usage:
 *   const mgr = new MempoolWsManager('mainnet', (walletId, addrs) => { ... });
 *   mgr.start();
 *   mgr.subscribeWallet(walletId, ['bc1q...', 'bc1q...']);
 */
export class MempoolWsManager {
  private ws: WebSocket | null = null;
  private addressToWallet = new Map<string, string>(); // address → walletId
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private resubTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(
    private readonly network: string,
    private readonly onActivity: WalletActivityCallback,
  ) {}

  start() {
    // Small delay so the process finishes booting before opening the socket
    setTimeout(() => this.connect(), 2_000);
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
  }

  /** Register addresses for a wallet. Safe to call multiple times as new addresses are derived. */
  subscribeWallet(walletId: string, addresses: string[]) {
    let added = false;
    for (const addr of addresses) {
      if (!this.addressToWallet.has(addr)) {
        this.addressToWallet.set(addr, walletId);
        added = true;
      }
    }
    if (added) this.scheduleResubscribe();
  }

  get subscribedCount() {
    return this.addressToWallet.size;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private connect() {
    if (this.destroyed || this.ws) return;

    const url = getMempoolWsUrl(this.network);
    console.log(`[mempool-ws:${this.network}] Connecting → ${url}`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`[mempool-ws:${this.network}] Connected`);
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS; // reset backoff on successful connect
      this.flushSubscribe();       // (re-)subscribe all tracked addresses
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()));
      } catch {
        // ignore malformed frames
      }
    });

    this.ws.on('close', () => {
      console.warn(`[mempool-ws:${this.network}] Disconnected`);
      this.ws = null;
      if (!this.destroyed) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      // 'close' always follows 'error', so just log here
      console.error(`[mempool-ws:${this.network}] Error:`, err.message);
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    // multi-address-transactions: activity on any of our tracked addresses
    const activity = msg['multi-address-transactions'] as
      | Record<string, { 'mempool-backed'?: unknown[]; confirmed?: unknown[] }>
      | undefined;

    if (!activity) return;

    // Group affected addresses by wallet
    const walletHits = new Map<string, string[]>();
    for (const [addr, data] of Object.entries(activity)) {
      const walletId = this.addressToWallet.get(addr);
      if (!walletId) continue;

      const hasTxns =
        (data['mempool-backed']?.length ?? 0) > 0 ||
        (data.confirmed?.length ?? 0) > 0;
      if (!hasTxns) continue;

      if (!walletHits.has(walletId)) walletHits.set(walletId, []);
      walletHits.get(walletId)!.push(addr);
    }

    for (const [walletId, addrs] of walletHits) {
      console.log(`[mempool-ws:${this.network}] Activity → wallet ${walletId} (${addrs.length} addr)`);
      this.onActivity(walletId, addrs);
    }
  }

  private flushSubscribe() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const addresses = Array.from(this.addressToWallet.keys());
    if (!addresses.length) return;
    this.ws.send(JSON.stringify({ 'track-addresses': addresses }));
    console.log(`[mempool-ws:${this.network}] Subscribed to ${addresses.length} addresses`);
  }

  private scheduleResubscribe() {
    if (this.resubTimer) return;
    this.resubTimer = setTimeout(() => {
      this.resubTimer = null;
      this.flushSubscribe();
    }, RESUBSCRIBE_DEBOUNCE_MS);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
    console.log(`[mempool-ws:${this.network}] Reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearTimers() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.resubTimer) { clearTimeout(this.resubTimer); this.resubTimer = null; }
  }
}
