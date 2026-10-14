import { Texture, Vector3 } from 'three';
import { CUSTOM_FISH_PARAMS } from '../config/params';
import type { Random } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';
import type { CustomFishRenderer } from '../render/fish/custom-fish-renderer';
import { canAddCustomFish, removeCustomFish, spawnCustomFish } from '../simulation/custom-fish';
import { chooseFishToRetire, spawnDroppingFish, startLeaving, stepTransitions } from '../simulation/fish-transitions';
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
  notSaved: '這隻魚不會被保存：目前無法使用瀏覽器儲存空間。',
  received: '收到一隻從手機來的魚！',
  replaced: '魚缸滿了，最舊的一隻魚游走了。',
  receivedReplaced: '收到一隻從手機來的魚！最舊的一隻魚游走了。',
} as const;

/** The notice after a new fish arrives, or undefined when nothing needs saying. */
export function arrivalMessage(source: 'local' | 'phone', replaced: boolean): string | undefined {
  if (source === 'phone') return replaced ? CUSTOM_FISH_MESSAGES.receivedReplaced : CUSTOM_FISH_MESSAGES.received;
  return replaced ? CUSTOM_FISH_MESSAGES.replaced : undefined;
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
  /** Bubble burst where a new fish enters the water. */
  splash(position: Vector3): void;
  /** World y of the screen's top edge at depth z, and the visible half width at z. */
  visibleTop(z: number): number;
  visibleHalfWidth(z: number): number;
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
  // Fish swimming away have already left「我的魚」, so they are not counted.
  const customCount = () => ctx.fish.filter((item) => item.customId !== undefined && item.mode !== 'leaving').length;
  const menu = createFishMenu({
    draw: () => drawing.open(),
    list: () => myFish.open([...loaded.values()].map(({ id, image }) => ({ id, image }))),
    pair: () => pairPanel?.open(),
  });
  const drawing = createDrawingPanel({ openChanged: panelChanged, submit: (png) => { void add(png); } });
  const myFish = createMyFishPanel({ openChanged: panelChanged, remove: (id) => remove(id) });
  const relay = ctx.relay === undefined ? defaultRelay() : ctx.relay;
  menu.setPairAvailable(relay !== null);
  const pairPanel = relay && createPhonePairPanel(phonePairUrl(location.origin + import.meta.env.BASE_URL, relay.room), { openChanged: panelChanged });
  const inbox = relay && createFishInbox({
    client: relay.client, room: relay.room, receive: (id, png) => receive(id, png),
    isVisible: () => document.visibilityState === 'visible', onWaiting: () => {},
  });
  const onVisibility = () => { if (document.visibilityState === 'visible') inbox?.poke(); };
  document.addEventListener('visibilitychange', onVisibility);

  function nextId(): number {
    return ctx.fish.reduce((max, item) => Math.max(max, item.id), -1) + 1;
  }

  /** When the tank is full, sends the oldest fish swimming out and forgets it locally. Returns whether one left. */
  function makeRoom(): boolean {
    if (canAddCustomFish(ctx.fish)) return false;
    const id = chooseFishToRetire(loaded.keys(), ctx.fish);
    const fish = id === undefined ? undefined : ctx.fish.find((item) => item.customId === id);
    if (id === undefined || !fish) return false;
    // Changing the mode also makes GrabController let go on its next update.
    startLeaving(fish);
    const entry = loaded.get(id);
    if (entry) URL.revokeObjectURL(entry.url);
    loaded.delete(id);
    menu.setCount(customCount());
    store?.remove(id).catch((error: unknown) => console.warn('自訂魚刪除失敗', error));
    return true;
  }

  /**
   * Decodes first, so a broken image never costs an old fish. New fish (`drop`) make room and fall in from the top;
   * fish restored on reload appear in place and are skipped when the tank is somehow full.
   */
  async function place(record: CustomFishRecord, drop: boolean): Promise<{ placed: boolean; replaced: boolean }> {
    const declined = { placed: false, replaced: false };
    if (disposed || loaded.has(record.id)) return declined;
    const { image, url } = await loadImage(record.png);
    if (disposed || loaded.has(record.id)) { URL.revokeObjectURL(url); return declined; }
    const replaced = drop && makeRoom();
    if (!canAddCustomFish(ctx.fish)) { URL.revokeObjectURL(url); return { placed: false, replaced }; }
    ctx.renderer.add(record.id, new Texture(image));
    const fish = drop
      ? spawnDroppingFish(record, ctx.getBounds(), ctx.random, nextId(), ctx.visibleTop)
      : spawnCustomFish(record, ctx.getBounds(), ctx.random, nextId());
    ctx.fish.push(fish);
    if (drop) {
      const { x, z } = fish.position;
      ctx.splash(new Vector3(x, ctx.visibleTop(z) - CUSTOM_FISH_PARAMS.splashDepth, z));
    }
    loaded.set(record.id, { id: record.id, image, url });
    menu.setCount(customCount());
    return { placed: true, replaced };
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
    if (loaded.has(id)) return 'placed';
    const record: CustomFishRecord = { id, createdAt: Date.now(), template: 'default', png };
    let result: { placed: boolean; replaced: boolean };
    try {
      result = await place(record, true);
    } catch (error) {
      console.warn('手機魚圖片無法讀取', error);
      return 'invalid';
    }
    // Declined only while closing (keep it for next time) or when it was placed meanwhile (done).
    if (!result.placed) return loaded.has(id) ? 'placed' : 'full';
    if (await save(record)) notice.showNotice(arrivalMessage('phone', result.replaced)!);
    return 'placed';
  }

  async function add(png: Blob): Promise<void> {
    const record: CustomFishRecord = { id: crypto.randomUUID(), createdAt: Date.now(), template: 'default', png };
    let result: { placed: boolean; replaced: boolean };
    try {
      result = await place(record, true);
    } catch (error) {
      console.warn('自訂魚載入失敗', error);
      return;
    }
    if (!result.placed) return;
    const message = arrivalMessage('local', result.replaced);
    if (await save(record) && message) notice.showNotice(message);
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
        try { await place(record, false); } catch (error) { console.warn('自訂魚載入失敗', error); }
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
    /** Steps falling and departing fish; departed ones leave the simulation and renderer. */
    update(dt: number): void {
      for (const id of stepTransitions(ctx.fish, dt, { visibleHalfWidth: ctx.visibleHalfWidth })) {
        removeCustomFish(ctx.fish, id);
        ctx.renderer.remove(id);
      }
    },
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
