import { PALETTE } from '../config/palette';
import { DRAWING_UI_PARAMS, GUIDE_PARAMS as p } from '../config/params';
import { assetUrl } from '../core/asset-url';
import { hexColor } from '../drawing/canvas-mapping';
import { createButton, createLayer } from './cozy';
import { createMouseIcon } from './mouse-icon';
import type { MouseButtonMark } from './mouse-icon';

export type { MouseButtonMark } from './mouse-icon';
export type GuideMode = 'camera' | 'mouse';
export interface GuideImage { src: string; alt: string }
export interface GuideItem { title: string; description: string; glove: GuideImage; mouse?: MouseButtonMark }
export interface GuideContent { heading: string; items: GuideItem[]; footnote: string }

const GLOVES = {
  open: { file: 'guide/glove-open.webp', alt: '手套張開的手' },
  pinch: { file: 'guide/glove-pinch.webp', alt: '手套大拇指和食指捏在一起' },
  fist: { file: 'guide/glove-fist.webp', alt: '手套握拳' },
} as const;
const glove = (pose: keyof typeof GLOVES): GuideImage => ({ src: assetUrl(GLOVES[pose].file), alt: GLOVES[pose].alt });

export function guideContent(mode: GuideMode): GuideContent {
  if (mode === 'camera') return {
    heading: '手勢說明',
    items: [
      { title: '張開手', description: '移動手來移動，魚會躲開你的手。', glove: glove('open') },
      { title: '捏合', description: '大拇指碰食指，在魚身上捏住就能抓起牠；放開後魚會逃走。', glove: glove('pinch') },
      { title: '握拳', description: '魚群會游過來，繞著你的手轉圈；手張開後魚會散開。', glove: glove('fist') },
    ],
    footnote: '也可以用滑鼠：左鍵抓魚、右鍵聚魚。',
  };
  return {
    heading: '滑鼠操作',
    items: [
      { title: '移動滑鼠', description: '魚會躲開游標。', glove: glove('open'), mouse: 'none' },
      { title: '按住左鍵', description: '在魚身上按住就能抓起牠；放開後魚會逃走。', glove: glove('pinch'), mouse: 'left' },
      { title: '按住右鍵', description: '魚群會游過來，繞著游標轉圈；放開後魚會散開。', glove: glove('fist'), mouse: 'right' },
    ],
    footnote: '觸控螢幕：用手指按住魚，就能把牠抓起來。',
  };
}

/** 純狀態：第一次 start 顯示按鈕；每個模式第一次 start 時（預設）開啟說明卡，之後只更新模式。 */
export function createGuideController(view: { render(mode: GuideMode, open: boolean): void; showButton(visible: boolean): void }) {
  let mode: GuideMode | null = null, open = false;
  const shown = new Set<GuideMode>();
  const update = () => { if (mode) view.render(mode, open); };
  return {
    start(next: GuideMode, options: { autoOpen?: boolean } = {}): void {
      if (mode === null) view.showButton(true);
      mode = next;
      if (!shown.has(next)) { shown.add(next); if (options.autoOpen ?? true) open = true; }
      update();
    },
    open(): void { if (mode) { open = true; update(); } },
    close(): void { if (mode && open) { open = false; update(); } },
    get mode() { return mode; },
    get isOpen() { return open; },
  };
}

export function createInteractionGuide(doc: Document = document) {
  const { layer, card } = createLayer('操作說明', doc);
  card.style.width = `min(${p.cardMaxWidth}px, calc(100vw - 32px))`;
  const heading = doc.createElement('h2');
  Object.assign(heading.style, { margin: '0 0 12px', fontSize: '1.25rem' });
  const grid = doc.createElement('div');
  Object.assign(grid.style, { display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${p.itemMinWidth}px, 1fr))`, gap: '12px' });
  const footnote = doc.createElement('p');
  Object.assign(footnote.style, { margin: '12px 0 0' });
  const start = createButton('開始玩', true, doc);
  start.style.marginTop = '12px';
  card.append(heading, grid, footnote, start);

  // 左下角工具列：「操作說明」加上其他常駐按鈕（例如鏡頭／滑鼠切換）。
  const toolbar = doc.createElement('div');
  Object.assign(toolbar.style, {
    position: 'fixed', left: `${p.buttonInset}px`, bottom: `${p.buttonInset}px`, display: 'none', gap: '8px',
    zIndex: String(DRAWING_UI_PARAMS.zIndex - 1), fontFamily: 'system-ui',
  });
  const help = createButton('操作說明', false, doc);
  help.style.boxShadow = '0 4px 16px #233b3b33';
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click'] as const) help.addEventListener(type, (event) => event.stopPropagation());
  toolbar.append(help);
  doc.body.append(toolbar);

  const image = (source: GuideImage) => {
    const img = doc.createElement('img');
    img.src = source.src; img.alt = source.alt;
    Object.assign(img.style, { height: `${p.imageSize}px`, width: `${p.imageSize}px`, objectFit: 'contain' });
    // 圖片失敗時隱藏，名稱與說明仍然完整。
    img.onerror = () => { img.hidden = true; };
    return img;
  };
  const renderItems = (mode: GuideMode) => {
    const content = guideContent(mode);
    heading.textContent = content.heading;
    footnote.textContent = content.footnote;
    grid.replaceChildren(...content.items.map((item) => {
      const box = doc.createElement('div');
      const pictures = doc.createElement('div');
      Object.assign(pictures.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', minHeight: `${p.imageSize}px`,
        borderRadius: '16px', background: hexColor(PALETTE.water),
      });
      if (item.mouse) {
        const arrow = doc.createElement('span');
        arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
        pictures.append(createMouseIcon(item.mouse, doc), arrow);
      }
      pictures.append(image(item.glove));
      const title = doc.createElement('strong');
      Object.assign(title.style, { display: 'block', marginTop: '8px' });
      title.textContent = item.title;
      const description = doc.createElement('p');
      Object.assign(description.style, { margin: '4px 0 0' });
      description.textContent = item.description;
      box.append(pictures, title, description);
      return box;
    }));
  };
  let rendered: GuideMode | null = null;
  const controller = createGuideController({
    render(mode, open) {
      if (mode !== rendered) { renderItems(mode); rendered = mode; }
      layer.style.display = open ? 'grid' : 'none';
    },
    showButton(visible) { toolbar.style.display = visible ? 'flex' : 'none'; },
  });
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && controller.isOpen) controller.close(); };
  start.addEventListener('click', () => controller.close());
  help.addEventListener('click', () => controller.open());
  doc.addEventListener('keydown', onKey);
  return {
    toolbar: toolbar as HTMLElement,
    start: controller.start,
    open: controller.open,
    close: controller.close,
    dispose(): void { doc.removeEventListener('keydown', onKey); layer.remove(); toolbar.remove(); },
  };
}
