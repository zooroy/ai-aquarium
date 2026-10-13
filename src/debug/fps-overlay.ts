import { DEBUG_PARAMS } from '../config/params';
import { PALETTE } from '../config/palette';

/** timestamp 為 RAF 毫秒時間，平均值只計完整影格間隔。 */
export function createFpsCounter() {
  let start: number | undefined;
  let frames = 0;
  return (timestamp: number): number | undefined => {
    if (start === undefined) { start = timestamp; return; }
    frames++;
    const elapsed = (timestamp - start) / 1000;
    if (elapsed < DEBUG_PARAMS.fpsInterval) return;
    const fps = frames / elapsed;
    start = timestamp; frames = 0;
    return fps;
  };
}

export function createFpsOverlay(search: string, doc?: Document) {
  if (!new URLSearchParams(search).has('debug')) return { update(_timestamp: number) {}, dispose() {} };
  const target = doc ?? document;
  const element = target.createElement('div');
  element.textContent = 'FPS: —';
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  Object.assign(element.style, {
    position: 'fixed', top: `${DEBUG_PARAMS.inset}px`, left: `${DEBUG_PARAMS.inset}px`,
    color: hex(PALETTE.debugText), background: hex(PALETTE.debugBackground),
    font: `${DEBUG_PARAMS.fontSize}px monospace`, pointerEvents: 'none', zIndex: '1',
  });
  target.body.append(element);
  const sample = createFpsCounter();
  return { update(timestamp: number) {
    const fps = sample(timestamp);
    if (fps !== undefined) element.textContent = `FPS: ${fps.toFixed(1)}`;
  }, dispose() { element.remove(); } };
}
