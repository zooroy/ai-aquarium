import { renderSVG } from 'uqr';
import { createButton, createLayer, row } from './cozy';

export interface PhonePairPanelCallbacks { openChanged(open: boolean): void }

const QR_SIZE = 240;

/** 「用手機畫」panel: a QR code for this tank's drawing page, plus the URL for manual entry. */
export function createPhonePairPanel(url: string, callbacks: PhonePairPanelCallbacks) {
  const { layer, card } = createLayer('用手機畫');
  card.style.textAlign = 'center';
  const title = document.createElement('h2');
  title.textContent = '用手機畫'; Object.assign(title.style, { margin: '0 0 8px', fontSize: '20px' });
  const hint = document.createElement('p');
  hint.textContent = '用手機相機掃描，畫好的魚會游進這個魚缸。';
  Object.assign(hint.style, { margin: '0 0 12px', fontSize: '14px' });
  const qr = document.createElement('div');
  qr.setAttribute('role', 'img'); qr.setAttribute('aria-label', '開啟手機畫圖頁的 QR code');
  // uqr only emits <rect>/<path> built from the URL, so this markup is generated, not user input.
  qr.innerHTML = renderSVG(url, { border: 4, ecc: 'M' });
  Object.assign(qr.style, { width: `${QR_SIZE}px`, maxWidth: '100%', margin: '0 auto', lineHeight: '0', borderRadius: '12px', overflow: 'hidden' });
  const svg = qr.querySelector('svg');
  if (svg) Object.assign(svg.style, { width: '100%', height: 'auto' });
  const link = document.createElement('p');
  link.textContent = url;
  Object.assign(link.style, { margin: '12px 0 0', fontSize: '12px', wordBreak: 'break-all', opacity: '0.75', userSelect: 'all' });
  const closeButton = createButton('關閉', true);
  closeButton.addEventListener('click', () => close());
  const actions = row(closeButton);
  actions.style.justifyContent = 'center';
  card.append(title, hint, qr, link, actions);

  let open = false;
  function close(): void {
    if (!open) return;
    open = false; layer.style.display = 'none';
    callbacks.openChanged(false);
  }
  return {
    open(): void {
      if (open) return;
      open = true; layer.style.display = 'grid';
      callbacks.openChanged(true);
    },
    close,
    get isOpen(): boolean { return open; },
    dispose(): void { close(); layer.remove(); },
  };
}
