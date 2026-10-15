import { expect, it, vi } from 'vitest';
import { createGuideController, createInteractionGuide, guideContent } from '../../src/ui/interaction-guide';
import { createMouseIcon } from '../../src/ui/mouse-icon';

/** 最小的假 DOM：只實作說明卡用到的部分。 */
class FakeElement {
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, ((event: unknown) => void)[]>();
  textContent = ''; hidden = false; src = ''; alt = '';
  onerror: (() => void) | null = null;
  removed = false;
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  append(...nodes: FakeElement[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeElement[]) { this.children = nodes; }
  addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  click() { for (const listener of this.listeners.get('click') ?? []) listener({ stopPropagation() {} }); }
  remove() { this.removed = true; }
  all(): FakeElement[] { return [this, ...this.children.flatMap((child) => child.all())]; }
  text(): string { return [this.textContent, ...this.children.map((child) => child.text())].join(' '); }
}
function fakeDocument() {
  const created: FakeElement[] = [];
  const keyListeners = new Set<(event: { key: string }) => void>();
  const body = new FakeElement('body');
  const doc = {
    body,
    createElement: (tag: string) => { const element = new FakeElement(tag); created.push(element); return element; },
    createElementNS: (_ns: string, tag: string) => { const element = new FakeElement(tag); created.push(element); return element; },
    addEventListener: (type: string, listener: (event: { key: string }) => void) => { if (type === 'keydown') keyListeners.add(listener); },
    removeEventListener: (type: string, listener: (event: { key: string }) => void) => { if (type === 'keydown') keyListeners.delete(listener); },
  };
  return { doc: doc as unknown as Document, body, created, keyListeners, press: (key: string) => { for (const listener of keyListeners) listener({ key }); } };
}

it('lists the three camera gestures and the three mouse actions with images, text and alt text', () => {
  const camera = guideContent('camera'), mouse = guideContent('mouse');
  expect(camera.items.map((item) => item.title)).toEqual(['張開手', '捏合', '握拳']);
  expect(camera.items.map((item) => item.glove.src.split('/').pop())).toEqual(['glove-open.webp', 'glove-pinch.webp', 'glove-fist.webp']);
  expect(camera.items.every((item) => item.mouse === undefined)).toBe(true);
  expect(camera.footnote).toContain('右鍵');
  expect(mouse.items.map((item) => item.title)).toEqual(['移動滑鼠', '按住左鍵', '按住右鍵']);
  expect(mouse.items.map((item) => item.mouse)).toEqual(['none', 'left', 'right']);
  expect(mouse.items.map((item) => item.glove.src.split('/').pop())).toEqual(['glove-open.webp', 'glove-pinch.webp', 'glove-fist.webp']);
  expect(mouse.footnote).toContain('觸控');
  for (const item of [...camera.items, ...mouse.items]) {
    expect(item.description.length).toBeGreaterThan(0);
    expect(item.glove.alt.length).toBeGreaterThan(0);
  }
  expect(camera.items[2].description).toContain('繞著');
  expect(mouse.items[2].description).toContain('繞著');
});

it('opens once on the first start, keeps the button, and reopens on demand', () => {
  const view = { render: vi.fn(), showButton: vi.fn() };
  const guide = createGuideController(view);
  guide.open();
  expect(view.render).not.toHaveBeenCalled(); expect(view.showButton).not.toHaveBeenCalled();
  guide.start('mouse');
  expect(view.showButton).toHaveBeenCalledWith(true);
  expect(view.render).toHaveBeenLastCalledWith('mouse', true); expect(guide.isOpen).toBe(true);
  guide.close(); expect(view.render).toHaveBeenLastCalledWith('mouse', false);
  guide.start('mouse'); // 鏡頭失敗時 finished 會被呼叫兩次
  expect(guide.isOpen).toBe(false);
  guide.open(); expect(view.render).toHaveBeenLastCalledWith('mouse', true);
  expect(view.showButton).toHaveBeenCalledOnce();
  guide.start('camera'); // 第一次切到鏡頭：自動開啟手勢說明
  expect(view.render).toHaveBeenLastCalledWith('camera', true);
  guide.close(); guide.start('mouse'); guide.start('camera');
  expect(guide.isOpen).toBe(false); expect(view.showButton).toHaveBeenCalledOnce();
  const replay = createGuideController({ render: vi.fn(), showButton: vi.fn() });
  replay.start('camera', { autoOpen: false });
  expect(replay.isOpen).toBe(false); expect(replay.mode).toBe('camera');
});

it('marks the pressed mouse button by fill, stroke width and a dot', () => {
  const { doc } = fakeDocument();
  const buttons = (mark: 'none' | 'left' | 'right') => {
    const svg = createMouseIcon(mark, doc) as unknown as FakeElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    const paths = svg.children.filter((child) => child.tag === 'path');
    return { svg, left: paths.find((path) => path.getAttribute('data-button') === 'left')!, right: paths.find((path) => path.getAttribute('data-button') === 'right')! };
  };
  const none = buttons('none');
  expect([none.left, none.right].map((path) => path.getAttribute('fill'))).toEqual(['none', 'none']);
  expect(none.svg.children.some((child) => child.tag === 'circle')).toBe(false);
  for (const side of ['left', 'right'] as const) {
    const icon = buttons(side), marked = icon[side], other = icon[side === 'left' ? 'right' : 'left'];
    expect(marked.getAttribute('fill')).not.toBe('none'); expect(other.getAttribute('fill')).toBe('none');
    expect(Number(marked.getAttribute('stroke-width'))).toBeGreaterThan(Number(other.getAttribute('stroke-width')));
    expect(icon.svg.children.filter((child) => child.tag === 'circle')).toHaveLength(1);
  }
});

it('renders the card, closes with Esc or 開始玩, survives broken images and cleans up', () => {
  const fake = fakeDocument();
  const guide = createInteractionGuide(fake.doc);
  const [layer, toolbar] = fake.body.children;
  const [help] = toolbar.children;
  expect(guide.toolbar).toBe(toolbar);
  expect(help.textContent).toBe('操作說明');
  expect(toolbar.style.display).toBe('none');
  expect(layer.style.display).toBe('none');
  guide.start('mouse');
  expect(layer.style.display).toBe('grid'); expect(toolbar.style.display).toBe('flex');
  const text = layer.text();
  for (const words of ['滑鼠操作', '移動滑鼠', '按住左鍵', '按住右鍵', '觸控螢幕']) expect(text).toContain(words);
  const images = layer.all().filter((node) => node.tag === 'img');
  expect(images).toHaveLength(3);
  expect(images.every((img) => img.alt.length > 0)).toBe(true);
  expect(layer.all().filter((node) => node.tag === 'svg')).toHaveLength(3);
  images[0].onerror?.();
  expect(images[0].hidden).toBe(true);
  expect(layer.text()).toContain('魚會躲開游標');
  fake.press('Escape'); expect(layer.style.display).toBe('none');
  help.click(); expect(layer.style.display).toBe('grid');
  layer.all().find((node) => node.tag === 'button' && node.textContent === '開始玩')!.click();
  expect(layer.style.display).toBe('none');
  guide.dispose();
  expect(layer.removed).toBe(true); expect(toolbar.removed).toBe(true); expect(fake.keyListeners.size).toBe(0);
});

it('shows the gesture guide in camera mode without mouse icons', () => {
  const fake = fakeDocument();
  const guide = createInteractionGuide(fake.doc);
  guide.start('camera');
  const [layer] = fake.body.children;
  for (const words of ['手勢說明', '張開手', '捏合', '握拳', '也可以用滑鼠']) expect(layer.text()).toContain(words);
  expect(layer.all().filter((node) => node.tag === 'svg')).toHaveLength(0);
  expect(layer.all().filter((node) => node.tag === 'img')).toHaveLength(3);
  guide.dispose();
});
