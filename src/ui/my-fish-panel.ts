import { CUSTOM_FISH_PARAMS as p, DRAWING_UI_PARAMS as ui } from '../config/params';
import { createButton, createLayer, row } from './cozy';
import { drawFishPreview } from './fish-canvas';

export interface MyFishEntry { id: string; image: CanvasImageSource }
export interface MyFishPanelCallbacks {
  remove(id: string): void;
  openChanged(open: boolean): void;
}

export function createMyFishPanel(callbacks: MyFishPanelCallbacks) {
  const { layer, card } = createLayer('我的魚');
  const title = document.createElement('h2');
  Object.assign(title.style, { margin: '0 0 8px', fontSize: '20px' });
  const empty = document.createElement('p');
  empty.textContent = '還沒有自訂魚。按「畫一隻魚」來畫第一隻吧。';
  const grid = document.createElement('div');
  Object.assign(grid.style, { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${ui.thumbnailWidth}px, 1fr))`, gap: '12px', marginTop: '8px' });
  const closeButton = createButton('關閉', true);
  closeButton.addEventListener('click', () => close());
  const actions = row(closeButton);
  actions.style.justifyContent = 'flex-end';
  card.append(title, empty, grid, actions);

  let open = false;
  let entries: MyFishEntry[] = [];

  function render(): void {
    title.textContent = `我的魚（${entries.length} / ${p.maxCount}）`;
    empty.hidden = entries.length > 0;
    grid.replaceChildren(...entries.map((entry) => {
      const cell = document.createElement('div');
      Object.assign(cell.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' });
      const thumb = document.createElement('canvas');
      thumb.width = ui.thumbnailWidth * 2; thumb.height = ui.thumbnailWidth;
      Object.assign(thumb.style, { width: '100%', aspectRatio: `${p.textureWidth} / ${p.textureHeight}` });
      const ctx = thumb.getContext('2d');
      if (ctx) drawFishPreview(ctx, entry.image);
      const remove = createButton('刪除');
      remove.setAttribute('aria-label', '刪除這隻魚');
      // In-panel confirmation instead of window.confirm, so it matches the Cozy UI.
      const confirm = document.createElement('div');
      Object.assign(confirm.style, { display: 'none', gap: '6px', alignItems: 'center', fontSize: '14px' });
      const question = document.createElement('span'); question.textContent = '確定刪除？';
      const yes = createButton('刪除', true); const no = createButton('保留');
      confirm.append(question, yes, no);
      remove.addEventListener('click', () => { remove.style.display = 'none'; confirm.style.display = 'flex'; });
      no.addEventListener('click', () => { confirm.style.display = 'none'; remove.style.display = ''; });
      yes.addEventListener('click', () => {
        entries = entries.filter((item) => item.id !== entry.id);
        callbacks.remove(entry.id);
        render();
      });
      cell.append(thumb, remove, confirm);
      return cell;
    }));
  }

  function close(): void {
    if (!open) return;
    open = false; layer.style.display = 'none';
    callbacks.openChanged(false);
  }

  return {
    open(list: MyFishEntry[]): void {
      entries = [...list];
      render();
      if (open) return;
      open = true; layer.style.display = 'grid';
      callbacks.openChanged(true);
    },
    close,
    get isOpen(): boolean { return open; },
    dispose(): void { close(); layer.remove(); },
  };
}
