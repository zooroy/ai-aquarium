import { Texture } from 'three';
import type { Random } from '../core/random';
import type { TankBounds } from '../core/tank-bounds';
import type { CustomFishRenderer } from '../render/fish/custom-fish-renderer';
import { canAddCustomFish, removeCustomFish, spawnCustomFish } from '../simulation/custom-fish';
import type { Fish } from '../simulation/fish-state';
import { createStore } from '../storage/custom-fish-store';
import type { CustomFishRecord, CustomFishStore } from '../storage/custom-fish-store';
import { createDrawingPanel } from './drawing-panel';
import { createFishMenu } from './fish-menu';
import { createMyFishPanel } from './my-fish-panel';
import { createNotice } from './notice';

export const CUSTOM_FISH_MESSAGES = {
  limit: '最多 20 隻自訂魚，請先在「我的魚」刪除一隻。',
  notSaved: '這隻魚不會被保存：目前無法使用瀏覽器儲存空間。',
} as const;

export interface CustomFishFeatureContext {
  fish: Fish[];
  renderer: CustomFishRenderer;
  random: Random;
  getBounds(): TankBounds;
  /** Pauses grabbing while a panel is open (fish-grab spec). */
  setGrabEnabled(enabled: boolean): void;
  /** Injectable for tests or fallbacks; defaults to IndexedDB with memory fallback. */
  openStore?: () => Promise<{ store: CustomFishStore; persistent: boolean }>;
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
  });
  const drawing = createDrawingPanel({ openChanged: panelChanged, submit: (png) => { void add(png); } });
  const myFish = createMyFishPanel({ openChanged: panelChanged, remove: (id) => remove(id) });

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

  async function add(png: Blob): Promise<void> {
    if (!canAddCustomFish(ctx.fish)) { notice.showNotice(CUSTOM_FISH_MESSAGES.limit); return; }
    const record: CustomFishRecord = { id: crypto.randomUUID(), createdAt: Date.now(), template: 'default', png };
    try {
      if (!(await place(record))) return;
    } catch (error) {
      console.warn('自訂魚載入失敗', error);
      return;
    }
    if (!store || !persistent) { notice.showNotice(CUSTOM_FISH_MESSAGES.notSaved); return; }
    try { await store.add(record); } catch (error) {
      console.warn('自訂魚保存失敗', error);
      notice.showNotice(CUSTOM_FISH_MESSAGES.notSaved);
    }
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
  })();

  return {
    ready,
    show: () => menu.show(),
    get count(): number { return customCount(); },
    dispose(): void {
      disposed = true;
      drawing.dispose(); myFish.dispose(); menu.dispose(); notice.dispose();
      for (const { url } of loaded.values()) URL.revokeObjectURL(url);
      loaded.clear();
    },
  };
}
