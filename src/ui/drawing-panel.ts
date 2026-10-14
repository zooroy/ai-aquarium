import { createButton, createLayer, row } from './cozy';
import { createDrawingEditor } from './drawing-editor';

export interface DrawingPanelCallbacks {
  /** Receives the 512×256 PNG texture; the panel has already closed. */
  submit(png: Blob): void;
  /** Called whenever the panel opens or closes, so the app can pause grabbing. */
  openChanged(open: boolean): void;
}

export function createDrawingPanel(callbacks: DrawingPanelCallbacks) {
  const { layer, card } = createLayer('畫一隻魚');
  const title = document.createElement('h2');
  title.textContent = '畫一隻魚'; Object.assign(title.style, { margin: '0 0 8px', fontSize: '20px' });
  const hint = document.createElement('p');
  hint.textContent = '在魚的輪廓裡塗上顏色，畫好後放進魚缸。';
  Object.assign(hint.style, { margin: '0 0 12px', fontSize: '14px' });

  const editor = createDrawingEditor();
  let open = false;
  let submitting = false;

  const cancel = createButton('取消');
  cancel.addEventListener('click', () => close());
  const submit = createButton('放進魚缸', true);
  submit.addEventListener('click', () => { void finish(); });
  const actions = row(cancel, submit);
  actions.style.justifyContent = 'flex-end';
  card.append(title, hint, editor.element, actions);

  async function finish(): Promise<void> {
    if (submitting) return;
    submitting = true; submit.disabled = true;
    try {
      const png = await editor.exportPng();
      close();
      callbacks.submit(png);
    } catch (error) {
      console.warn('魚的圖片匯出失敗', error);
    } finally {
      submitting = false; submit.disabled = false;
    }
  }

  function close(): void {
    if (!open) return;
    open = false;
    layer.style.display = 'none';
    callbacks.openChanged(false);
  }

  return {
    open(): void {
      if (open) return;
      open = true;
      layer.style.display = 'grid';
      editor.reset();
      callbacks.openChanged(true);
    },
    close,
    get isOpen(): boolean { return open; },
    dispose(): void { editor.dispose(); close(); layer.remove(); },
  };
}
