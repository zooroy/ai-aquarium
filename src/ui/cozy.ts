import { PALETTE } from '../config/palette';
import { DRAWING_UI_PARAMS as ui } from '../config/params';
import { hexColor } from '../drawing/canvas-mapping';

const STOPPED = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'click', 'wheel'] as const;

/** Full-screen layer that keeps its pointer events away from the aquarium canvas. */
export function createLayer(label: string, doc: Document = document): { layer: HTMLDivElement; card: HTMLElement } {
  const layer = doc.createElement('div');
  Object.assign(layer.style, { position: 'fixed', inset: '0', display: 'none', placeItems: 'center', zIndex: String(ui.zIndex), cursor: 'default' });
  for (const type of STOPPED) layer.addEventListener(type, (event) => event.stopPropagation());
  const card = doc.createElement('section');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', label);
  Object.assign(card.style, {
    boxSizing: 'border-box', width: `min(${ui.panelMaxWidth}px, calc(100vw - 32px))`, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    padding: '20px', borderRadius: '24px', background: `${hexColor(PALETTE.sand)}ee`, color: hexColor(PALETTE.debugBackground),
    boxShadow: '0 8px 32px #233b3b33', fontFamily: 'system-ui', lineHeight: '1.5',
  });
  layer.append(card); doc.body.append(layer);
  return { layer, card };
}

export function createButton(label: string, primary = false, doc: Document = document): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button'; button.textContent = label;
  Object.assign(button.style, {
    cursor: 'pointer', border: '0', borderRadius: '12px', padding: '10px 16px', font: 'inherit',
    background: hexColor(primary ? PALETTE.debugBackground : PALETTE.water),
    color: hexColor(primary ? PALETTE.sand : PALETTE.debugBackground),
  });
  return button;
}

/** Visually marks the selected tool without relying on colour alone. */
export function setSelected(button: HTMLElement, selected: boolean): void {
  button.setAttribute('aria-pressed', String(selected));
  button.style.outline = selected ? `3px solid ${hexColor(PALETTE.debugBackground)}` : 'none';
  button.style.outlineOffset = '2px';
}

export function row(...children: HTMLElement[]): HTMLDivElement {
  const element = document.createElement('div');
  Object.assign(element.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '12px' });
  element.append(...children);
  return element;
}
