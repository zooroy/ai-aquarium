import { PALETTE } from '../config/palette';
import { CUSTOM_FISH_PARAMS as p, DRAWING_UI_PARAMS as ui } from '../config/params';
import { brushPixels, clientToUv, hexColor } from '../drawing/canvas-mapping';
import { beginStroke, clearDrawing, createDrawing, endStroke, extendStroke, getDrawing, undo } from '../drawing/drawing-model';
import type { DrawingState, Stroke } from '../drawing/drawing-model';
import { createButton, row, setSelected } from './cozy';
import { canvas2d, drawFishPreview, exportDrawingPng, paintDrawing } from './fish-canvas';

const SIZES: Stroke['size'][] = ['small', 'medium', 'large'];
const SIZE_LABELS: Record<Stroke['size'], string> = { small: '小', medium: '中', large: '大' };

/** Fish canvas plus palette and tools, shared by the desktop panel and the phone page. */
export function createDrawingEditor() {
  const view = document.createElement('canvas');
  view.width = p.textureWidth; view.height = p.textureHeight;
  view.setAttribute('aria-label', '魚的畫布');
  Object.assign(view.style, { display: 'block', width: '100%', aspectRatio: `${p.textureWidth} / ${p.textureHeight}`, touchAction: 'none', cursor: 'crosshair', borderRadius: '16px', background: `${hexColor(PALETTE.water)}88` });
  const viewCtx = view.getContext('2d');
  if (!viewCtx) throw new Error('Canvas 2D is unavailable');
  const [paint, paintCtx] = canvas2d();

  let state: DrawingState = createDrawing();
  let color: Stroke['color'] = PALETTE.brush[0];
  let size: Stroke['size'] = 'medium';
  let lastColor: number = PALETTE.brush[0];
  let activePointer: number | undefined;
  let frame: number | undefined;

  const render = () => {
    frame = undefined;
    paintDrawing(paintCtx, getDrawing(state));
    drawFishPreview(viewCtx, paint);
  };
  const schedule = () => { frame ??= requestAnimationFrame(render); };

  const swatches = PALETTE.brush.map((swatch) => {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('aria-label', `顏色 ${hexColor(swatch)}`);
    Object.assign(button.style, { width: `${ui.swatchSize}px`, height: `${ui.swatchSize}px`, borderRadius: '50%', border: `2px solid ${hexColor(PALETTE.sand)}`, background: hexColor(swatch), cursor: 'pointer', padding: '0' });
    button.addEventListener('click', () => { color = swatch; lastColor = swatch; refreshTools(); });
    return { button, swatch };
  });
  const sizeButtons = SIZES.map((option) => {
    const button = createButton('');
    button.setAttribute('aria-label', `筆刷${SIZE_LABELS[option]}`);
    const dot = document.createElement('span');
    const px = Math.max(4, brushPixels(option) * 0.6);
    Object.assign(dot.style, { display: 'inline-block', width: `${px}px`, height: `${px}px`, borderRadius: '50%', background: hexColor(PALETTE.debugBackground), verticalAlign: 'middle' });
    button.append(dot, document.createTextNode(` ${SIZE_LABELS[option]}`));
    button.addEventListener('click', () => { size = option; refreshTools(); });
    return { button, option };
  });
  const eraser = createButton('橡皮擦');
  eraser.addEventListener('click', () => { color = color === 'erase' ? lastColor : 'erase'; refreshTools(); });
  const undoButton = createButton('復原');
  undoButton.addEventListener('click', () => { state = undo(state); schedule(); refreshTools(); });
  const clearButton = createButton('清除');
  clearButton.addEventListener('click', () => { state = clearDrawing(state); schedule(); refreshTools(); });

  function refreshTools(): void {
    for (const { button, swatch } of swatches) setSelected(button, color === swatch);
    for (const { button, option } of sizeButtons) setSelected(button, size === option);
    setSelected(eraser, color === 'erase');
    undoButton.disabled = state.history.length === 0 && state.active === null;
  }

  const element = document.createElement('div');
  element.append(view, row(...swatches.map(({ button }) => button)), row(...sizeButtons.map(({ button }) => button), eraser, undoButton, clearButton));

  const toUv = (event: PointerEvent) => clientToUv(event.clientX, event.clientY, view.getBoundingClientRect());
  view.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || activePointer !== undefined) return;
    event.preventDefault();
    activePointer = event.pointerId;
    try { view.setPointerCapture(event.pointerId); } catch { /* synthetic events may not be capturable */ }
    state = beginStroke(state, color, size, toUv(event));
    schedule(); refreshTools();
  });
  view.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    for (const item of events.length > 0 ? events : [event]) state = extendStroke(state, toUv(item));
    schedule();
  });
  const finishStroke = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = undefined;
    state = endStroke(state);
    schedule(); refreshTools();
  };
  view.addEventListener('pointerup', finishStroke);
  view.addEventListener('pointercancel', finishStroke);

  return {
    element,
    /** Blank drawing, medium brush, keeping the last chosen colour. */
    reset(): void {
      state = createDrawing(); color = lastColor; size = 'medium'; activePointer = undefined;
      refreshTools(); render();
    },
    /** Ends any stroke in progress and exports the 512×256 texture. */
    exportPng(): Promise<Blob> {
      state = endStroke(state); activePointer = undefined;
      return exportDrawingPng(getDrawing(state));
    },
    dispose(): void { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; },
  };
}
