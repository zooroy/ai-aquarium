import { blendPose } from './hand-poses';
import { HAND_PARAMS as p } from '../../config/params';
import { createRandom } from '../../core/random';
import type { HandFrame } from './types';

export interface ReplayKeyframe { timeMs: number; x: number; y: number; pinch: number; fist?: number; }
export interface ReplayScript {
  keyframes: readonly ReplayKeyframe[];
  dropouts?: readonly { startMs: number; endMs: number }[];
  jitter?: boolean;
}
const scripts: Record<string, ReplayScript> = {
  fist: { keyframes: [0,1000,6000,7000,10000].map(timeMs=>({timeMs,x:.5,y:.5,pinch:0,fist:timeMs>=1000&&timeMs<=6000?1:0})) },
  demo: { keyframes: [
    { timeMs: 0, x: .28, y: .5, pinch: 0 }, { timeMs: 2500, x: .5, y: .5, pinch: 0 },
    { timeMs: 3500, x: .5, y: .5, pinch: 1 }, { timeMs: 6500, x: .72, y: .5, pinch: 1 },
    { timeMs: 7500, x: .72, y: .5, pinch: 0 }, { timeMs: 10000, x: .72, y: .5, pinch: 0 },
  ] },
  jitter: { keyframes: [{ timeMs: 0, x: .5, y: .5, pinch: 0 }], jitter: true },
  dropout: { keyframes: [{ timeMs: 0, x: .5, y: .5, pinch: 1 }], dropouts: [
    { startMs: 1000, endMs: 1200 }, { startMs: 2000, endMs: 2500 },
  ] },
};
export function getReplayScript(name: string): ReplayScript {
  if (!scripts[name]) throw new Error(`Unknown replay script: ${name}`);
  return scripts[name];
}
export function createReplaySource(script: ReplayScript): { frameAt(timeMs: number): HandFrame | null } {
  if (!script.keyframes.length) throw new Error('Replay requires keyframes');
  const keys = [...script.keyframes].sort((a, b) => a.timeMs - b.timeMs);
  return { frameAt(timeMs) {
    if (script.dropouts?.some((gap) => timeMs >= gap.startMs && timeMs < gap.endMs)) return null;
    let left = keys[0], right = keys[keys.length - 1];
    for (const key of keys) { if (key.timeMs <= timeMs) left = key; else { right = key; break; } }
    const fraction = right.timeMs > left.timeMs ? Math.max(0, Math.min(1, (timeMs - left.timeMs) / (right.timeMs - left.timeMs))) : 0;
    const mix = (a: number, b: number) => a + (b - a) * fraction;
    const pinch = Math.max(0, Math.min(1, mix(left.pinch, right.pinch)));
    const worldLandmarks = blendPose(pinch, mix(left.fist ?? 0, right.fist ?? 0));
    const center = { x: (worldLandmarks[4].x + worldLandmarks[8].x) / 2, y: (worldLandmarks[4].y + worldLandmarks[8].y) / 2 };
    // 依時間決定種子，重複或跳時呼叫仍得到相同影格。
    const random = createRandom(p.replaySeed + Math.floor(timeMs * p.replayHz / 1000));
    const jitterX = script.jitter ? random.range(-p.replayJitter, p.replayJitter) : 0;
    const jitterY = script.jitter ? random.range(-p.replayJitter, p.replayJitter) : 0;
    const landmarks = worldLandmarks.map((joint) => ({
      x: joint.x - center.x + mix(left.x, right.x) + jitterX,
      y: joint.y - center.y + mix(left.y, right.y) + jitterY, z: joint.z,
    }));
    return { landmarks, worldLandmarks, timestamp: timeMs, handedness: {categoryName: 'Right', score: 0.99} };
  } };
}
