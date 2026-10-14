import { Texture } from 'three';
import type { Random } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';
import type { CustomFishRenderer } from '../render/fish/custom-fish-renderer';
import { canAddCustomFish, removeCustomFish, spawnCustomFish } from '../simulation/custom-fish';
import type { Fish } from '../simulation/fish-state';
import { createFishInbox } from '../relay/fish-inbox';
import type { ReceiveResult } from '../relay/fish-inbox';
import { createRelayClientFromEnv } from '../relay/relay-client';
import type { RelayClient } from '../relay/relay-client';
import { loadRoomCode, phonePairUrl } from '../relay/room-code';
import { createStore } from '../storage/custom-fish-store';
import type { CustomFishRecord, CustomFishStore } from '../storage/custom-fish-store';
import { createDrawingPanel } from './drawing-panel';
import { createFishMenu } from './fish-menu';
import { createMyFishPanel } from './my-fish-panel';
import { createNotice } from './notice';
import { createPhonePairPanel } from './phone-pair-panel';

export const CUSTOM_FISH_MESSAGES = {
  limit: '最多 20 隻自訂魚，請先在「我的魚」刪除一隻。',
  notSaved: '這隻魚不會被保存：目前無法使用瀏覽器儲存空間。',
  received: '收到一隻從手機來的魚！',
  waiting: '有手機送來的魚在等待，請先在「我的魚」刪除一隻。',
} as const;

/** What to do with a fish arriving from the relay, before any decoding. */
export function receiveAction(alreadyLoaded: boolean, canAdd: boolean): 'duplicate' | 'full' | 'place' {
  if (alreadyLoaded) return 'duplicate';
  return canAdd ? 'place' : 'full';
}

/** Calls `show` only when the value turns from false to true. */
export function createRisingEdge(show: () => void) {
  let previous = false;
  return (value: boolean) => {
    if (value && !previous) show();
    previous = value;
  };
}

export interface CustomFishFeatureContext {
  fish: Fish[];
  renderer: CustomFishRenderer;
  random: Random;
  getBounds(): TankBounds;
  /** Pauses grabbing while a panel is open (fish-grab spec). */
  setGrabEnabled(enabled: boolean): void;
  /** Injectable for tests or fallbacks; defaults to IndexedDB with memory fallback. */
  openStore?: () => Promise<{ store: CustomFishStore; persistent: boolean }>;
  /** Injectable relay; defaults to the Supabase client from env and this device's saved room code. null disables phone drawing. */
  relay?: { client: Pick<RelayClient, 'list' | 'download' | 'remove'>; room: string } | null;
}

interface Loaded { id: string; image: HTMLImageElement; url: string }

async function loadImage(png: Blob): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(png);
  const image = new Image();
  image.src = url;
  try { await image.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
  return { image, url };
}

/** Wires the drawing panel, my-fish list, storage, simulation and renderer together. */
export function createCustomFishFeature(ctx: CustomFishFeatureContext) {
  const loaded = new Map<string, Loaded>();
  const notice = createNotice();
  let store: CustomFishStore | undefined;
  let persistent = true;
  let disposed = false;
  let openPanels = 0;

  const panelChanged = (open: boolean) => {
    openPanels = Math.max(0, openPanels + (open ? 1 : -1));
    ctx.setGrabEnabled(openPanels === 0);
  };
  const customCount = () => ctx.fish.filter((item) => item.customId !== undefined).length;
  const menu = createFishMenu({
    draw: () => {
      if (!canAddCustomFish(ctx.fish)) { notice.showNotice(CUSTOM_FISH_MESSAGES.limit); return; }
      drawing.open();
    },
    list: () => myFish.open([...loaded.values()].map(({ id, image }) => ({ id, image }))),
    pair: () => pairPanel?.open(),
  });
  const drawing = createDrawingPanel({ openChanged: panelChanged, submit: (png) => { void add(png); } });
  const myFish = createMyFishPanel({ openChanged: panelChanged, remove: (id) => remove(id) });
  const relay = ctx.relay === undefined ? defaultRelay() : ctx.relay;
  menu.setPairAvailable(relay !== null);
  const pairPanel = relay && createPhonePairPanel(phonePairUrl(location.origin + import.meta.env.BASE_URL, relay.room), { openChanged: panelChanged });
  const showWaiting = createRisingEdge(() => notice.showNotice(CUSTOM_FISH_MESSAGES.waiting));
  const inbox = relay && createFishInbox({
    client: relay.client, room: relay.room, receive: (id, png) => receive(id, png),
    isVisible: () => document.visibilityState === 'visible', onWaiting: showWaiting,
  });
  const onVisibility = () => { if (document.visibilityState === 'visible') inbox?.poke(); };
  document.addEventListener('visibilitychange', onVisibility);

  function nextId(): number {
    return ctx.fish.reduce((max, item) => Math.max(max, item.id), -1) + 1;
  }

  async function place(record: CustomFishRecord): Promise<boolean> {
    if (disposed || loaded.has(record.id) || !canAddCustomFish(ctx.fish)) return false;
    const { image, url } = await loadImage(record.png);
    if (disposed) { URL.revokeObjectURL(url); return false; }
    const texture = new Texture(image);
    ctx.renderer.add(record.id, texture);
    ctx.fish.push(spawnCustomFish(record, ctx.getBounds(), ctx.random, nextId()));
    loaded.set(record.id, { id: record.id, image, url });
    menu.setCount(customCount());
    return true;
  }

  /** Saves a placed record; returns false (after the notice) when it will not persist. */
  async function save(record: CustomFishRecord): Promise<boolean> {
    if (!store || !persistent) { notice.showNotice(CUSTOM_FISH_MESSAGES.notSaved); return false; }
    try { await store.add(record); return true; } catch (error) {
      console.warn('自訂魚保存失敗', error);
      notice.showNotice(CUSTOM_FISH_MESSAGES.notSaved);
      return false;
    }
  }

  /** A fish from the phone relay. The relay id becomes the local id, so a failed remote delete never duplicates it. */
  async function receive(id: string, png: Blob): Promise<ReceiveResult> {
    const action = receiveAction(loaded.has(id), canAddCustomFish(ctx.fish));
    if (action === 'duplicate') return 'placed';
    if (action === 'full') return 'full';
    const record: CustomFishRecord = { id, createdAt: Date.now(), template: 'default', png };
    try {
      // place() declines when the id appeared meanwhile (done) or the tank filled up / closed (keep waiting).
      if (!(await place(record))) return loaded.has(id) ? 'placed' : 'full';
    } catch (error) {
      console.warn('手機魚圖片無法讀取', error);
      return 'invalid';
    }
    if (await save(record)) notice.showNotice(CUSTOM_FISH_MESSAGES.received);
    return 'placed';
  }

  async function add(png: Blob): Promise<void> {
    if (!canAddCustomFish(ctx.fish)) { notice.showNotice(CUSTOM_FISH_MESSAGES.limit); return; }
    const record: CustomFishRecord = { id: crypto.randomUUID(), createdAt: Date.now(), template: 'default', png };
    try {
      if (!(await place(record))) return;
    } catch (error) {
      console.warn('自訂魚載入失敗', error);
      return;
    }
    await save(record);
  }

  function remove(id: string): void {
    removeCustomFish(ctx.fish, id);
    ctx.renderer.remove(id);
    const entry = loaded.get(id);
    if (entry) URL.revokeObjectURL(entry.url);
    loaded.delete(id);
    menu.setCount(customCount());
    store?.remove(id).catch((error: unknown) => console.warn('自訂魚刪除失敗', error));
  }

  const ready = (async () => {
    try {
      const opened = await (ctx.openStore ?? createStore)();
      if (disposed) return;
      store = opened.store; persistent = opened.persistent;
      for (const record of await store.list()) {
        try { await place(record); } catch (error) { console.warn('自訂魚載入失敗', error); }
      }
    } catch (error) {
      console.warn('自訂魚清單讀取失敗', error);
    }
    // Start after local fish load, so the 20-fish limit sees them before any phone fish arrives.
    if (!disposed) inbox?.start();
  })();

  return {
    ready,
    show: () => menu.show(),
    get count(): number { return customCount(); },
    dispose(): void {
      disposed = true;
      inbox?.stop(); document.removeEventListener('visibilitychange', onVisibility);
      drawing.dispose(); myFish.dispose(); pairPanel?.dispose(); menu.dispose(); notice.dispose();
      for (const { url } of loaded.values()) URL.revokeObjectURL(url);
      loaded.clear();
    },
  };
}

function defaultRelay(): { client: RelayClient; room: string } | null {
  const client = createRelayClientFromEnv();
  return client ? { client, room: loadRoomCode(safeLocalStorage()) } : null;
}

function safeLocalStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
