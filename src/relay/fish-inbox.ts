import { RELAY_PARAMS as p } from '../config/params';
import type { RelayClient } from './relay-client';

export type ReceiveResult = 'placed' | 'full' | 'invalid';

export interface FishInboxOptions {
  client: Pick<RelayClient, 'list' | 'download' | 'remove'>;
  room: string;
  /** Places the fish locally; 'placed' and 'invalid' are deleted from the relay, 'full' stays waiting. */
  receive(id: string, png: Blob): Promise<ReceiveResult>;
  isVisible(): boolean;
  /** true when a fish is waiting because the tank is full, false once a round finishes without that. */
  onWaiting(waiting: boolean): void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  intervalMs?: number;
}

/** Polls the relay with chained timeouts so rounds never overlap; every error is logged and polling continues. */
export function createFishInbox(options: FishInboxOptions) {
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const intervalMs = options.intervalMs ?? p.pollIntervalMs;
  let timer: unknown;
  let running = false;
  let stopped = true;

  async function round(): Promise<void> {
    const { client, room } = options;
    const ids = await client.list(room);
    let full = false;
    for (const id of ids) {
      if (stopped) return;
      let png: Blob;
      try { png = await client.download(room, id); } catch (error) { console.warn('手機魚下載失敗', error); continue; }
      const result = await options.receive(id, png);
      if (result === 'full') { full = true; break; }
      try { await client.remove(room, id); } catch (error) { console.warn('手機魚刪除失敗', error); }
    }
    if (!stopped) options.onWaiting(full);
  }

  function schedule(ms: number): void {
    if (stopped) return;
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(() => { timer = undefined; void poll(); }, ms);
  }

  async function poll(): Promise<void> {
    if (stopped || running) return;
    if (options.isVisible()) {
      running = true;
      try { await round(); } catch (error) { console.warn('手機魚查詢失敗', error); } finally { running = false; }
    }
    schedule(intervalMs);
  }

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      void poll();
    },
    /** Call when the page becomes visible again to check immediately. */
    poke(): void {
      if (stopped || running) return;
      if (timer !== undefined) { clearTimer(timer); timer = undefined; }
      void poll();
    },
    stop(): void {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
    },
  };
}
