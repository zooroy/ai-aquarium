import { CUSTOM_FISH_PARAMS as p, DRAWING_UI_PARAMS as ui } from '../config/params';
import { createButton } from './cozy';

export interface FishMenuCallbacks { draw(): void; list(): void }

/** Top-right「畫一隻魚」and「我的魚 (n/20)」buttons; hidden until the onboarding card has closed. */
export function createFishMenu(callbacks: FishMenuCallbacks) {
  const bar = document.createElement('div');
  Object.assign(bar.style, { position: 'fixed', top: `${ui.menuInset}px`, right: `${ui.menuInset}px`, display: 'none', gap: '8px', zIndex: String(ui.zIndex - 1), fontFamily: 'system-ui' });
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click'] as const) bar.addEventListener(type, (event) => event.stopPropagation());
  const draw = createButton('畫一隻魚', true);
  const list = createButton('');
  for (const button of [draw, list]) button.style.boxShadow = '0 4px 16px #233b3b33';
  draw.addEventListener('click', () => callbacks.draw());
  list.addEventListener('click', () => callbacks.list());
  bar.append(draw, list);
  document.body.append(bar);
  const setCount = (count: number) => { list.textContent = `我的魚（${count}/${p.maxCount}）`; };
  setCount(0);
  return {
    show(): void { bar.style.display = 'flex'; },
    setCount,
    dispose(): void { bar.remove(); },
  };
}
