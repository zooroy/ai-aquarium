import { expect, it } from 'vitest';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { pinchRatio } from '../../../src/input/hand/pinch';
it('provides open/pinched hands and a centered pinch point on the demo route', () => {
  const source = createReplaySource(getReplayScript('demo'));
  expect(pinchRatio(source.frameAt(0)!.landmarks)).toBeGreaterThan(.4);
  const closed = source.frameAt(3500)!;
  expect(pinchRatio(closed.landmarks)).toBeLessThan(.25);
  expect((closed.landmarks[4].x + closed.landmarks[8].x) / 2).toBeCloseTo(.5);
  expect(closed.worldLandmarks).toHaveLength(21);
  expect(pinchRatio(source.frameAt(10000)!.landmarks)).toBeGreaterThan(.4);
  const jitter = createReplaySource(getReplayScript('jitter'));
  expect(jitter.frameAt(100)).toEqual(jitter.frameAt(100));
});
it('returns null in both dropout intervals and resumes at their end', () => {
  const source = createReplaySource(getReplayScript('dropout'));
  for (const time of [1000,1100,1199,2000,2400,2499]) expect(source.frameAt(time)).toBeNull();
  for (const time of [999,1200,1999,2500]) expect(source.frameAt(time)).not.toBeNull();
});
