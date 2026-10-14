import { expect, it } from 'vitest';
import { pinchRatio, PinchDetector } from '../../../src/input/hand/pinch';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
it('uses hysteresis including strict threshold boundaries', () => {
  const detector = new PinchDetector();
  expect(detector.update(.5)).toBe(false); expect(detector.update(.25)).toBe(false);
  expect(detector.update(.2)).toBe(true);
  for (const ratio of [.26,.38,.26,.38,.4]) expect(detector.update(ratio)).toBe(true);
  expect(detector.update(.45)).toBe(false); expect(detector.update(.3)).toBe(false);
});
it('normalizes hand size and ignores depth', () => {
  const lm = createReplaySource(getReplayScript('demo')).frameAt(0)!.landmarks;
  const ratio = pinchRatio(lm);
  expect(Math.abs(pinchRatio(lm.map((v) => ({ x: v.x * .5, y: v.y * .5, z: 999 }))) - ratio)).toBeLessThan(.05);
  expect(pinchRatio([])).toBe(Infinity);
});
