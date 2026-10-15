// Frozen pre-extraction replay for exact output regression checks.
import { HAND_PARAMS as p } from '../../../../src/config/params';
import { createRandom } from '../../../../src/core/random';
import type { HandFrame, Landmark } from '../../../../src/input/hand/types';

export interface ReplayKeyframe { timeMs: number; x: number; y: number; pinch: number; }
export interface ReplayScript {
  keyframes: readonly ReplayKeyframe[];
  dropouts?: readonly { startMs: number; endMs: number }[];
  jitter?: boolean;
}
// 掌根到中指根約8cm；表格於輸出時反轉 x 成未鏡像相機中的右手（拇指在右）。
const OPEN: readonly (readonly number[])[] = [
  [0, .08, 0], [-.035,.055,0],[-.06,.025,0],[-.08,0,0],[-.10,-.02,0],
  [-.03,0,0],[-.035,-.035,0],[-.035,-.06,0],[-.035,-.08,0],
  [0,0,0],[0,-.04,0],[0,-.07,0],[0,-.095,0],
  [.025,.005,0],[.03,-.035,0],[.03,-.06,0],[.03,-.08,0],
  [.045,.02,0],[.055,-.01,0],[.06,-.035,0],[.065,-.05,0],
];
const CLOSED = OPEN.map((point) => [...point]);
CLOSED[2] = [-.05,.01,-.01]; CLOSED[3] = [-.035,-.02,-.02]; CLOSED[4] = [-.022,-.04,-.025];
CLOSED[6] = [-.03,-.03,-.01]; CLOSED[7] = [-.025,-.045,-.02]; CLOSED[8] = [-.018,-.04,-.025];

const scripts: Record<string, ReplayScript> = {
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
    const worldLandmarks: Landmark[] = OPEN.map((point, i) => ({
      x: -(point[0] + (CLOSED[i][0] - point[0]) * pinch),
      y: point[1] + (CLOSED[i][1] - point[1]) * pinch,
      z: point[2] + (CLOSED[i][2] - point[2]) * pinch,
    }));
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
