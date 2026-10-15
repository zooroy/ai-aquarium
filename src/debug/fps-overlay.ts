import type { HandPose } from '../input/hand/types';
import type { Fish } from '../simulation/fish-state';
import type { InputState } from '../input/types';
import type { DetectionStats } from '../ui/camera-session';
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
  if (!new URLSearchParams(search).has('debug')) return { update(_timestamp: number) {}, setDetection(_stats: DetectionStats | undefined) {}, setInteraction(_fish: readonly Fish[], _state: InputState, _pose?:HandPose) {}, dispose() {} };
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
  let fpsText = 'FPS: —';
  let interaction = '｜抓住：0｜逃走：0｜手:無';
  let detection: DetectionStats | undefined;
  const refresh = () => {
    element.textContent = fpsText + interaction + (detection
      ? ` | detect ${detection.hz.toFixed(1)} Hz | ${detection.averageMs.toFixed(1)} ms | ${detection.delegate} | 偵測: ${detection.detected ? '有' : '無'}`
      : '');
  };
  refresh();
  return { update(timestamp: number) {
    const fps = sample(timestamp);
    if (fps !== undefined) { fpsText = `FPS: ${fps.toFixed(1)}`; refresh(); }
  }, setDetection(stats: DetectionStats | undefined) { detection = stats; refresh(); }, setInteraction(fish: readonly Fish[], state: InputState, pose?:HandPose) {
    const hand = state.pointers.find((pointer) => pointer.source === 'hand');
    const side=pose?.handedness;
    const mouse=state.pointers.find(pointer=>pointer.source==='mouse');
    const custom = fish.filter((item) => item.customId !== undefined).length;
    const next = `｜抓住：${fish.filter((item) => item.mode === 'grabbed').length}｜逃走：${fish.filter((item) => item.mode === 'fleeing').length}${custom > 0 ? `｜自訂魚：${custom}` : ''}｜手:${hand ? (hand.fist ? '握拳' : hand.pressed ? '捏住' : '張開') + (side ? `(${side==='right'?'右':'左'})` : '(未定)') : '無'}${hand ? `｜握拳比例:${(pose?.fistRatio ?? Infinity).toFixed(2)}` : ''}${mouse ? `｜滑鼠:${mouse.fist?'握拳':mouse.pressed?'按下':'未按'}` : ''}`;
    if (next !== interaction) { interaction = next; refresh(); }
  }, dispose() { element.remove(); } };
}
