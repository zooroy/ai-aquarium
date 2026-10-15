import { expect, it } from 'vitest';
import { HandProvider } from '../../../src/input/hand/hand-provider';
import { createReplaySource, getReplayScript } from '../../../src/input/hand/replay-source';
import { mapToScreen } from '../../../src/input/hand/hand-mapping';
it('exposes one mirrored midpoint pointer, transformed joints and independent snapshots', () => {
  const source = createReplaySource(getReplayScript('demo')), provider = new HandProvider();
  expect(provider.getPointers()).toEqual([]);
  const frame = source.frameAt(0)!; provider.ingest(frame, 0);
  const midpoint = { x: (frame.landmarks[4].x + frame.landmarks[8].x) / 2, y: (frame.landmarks[4].y + frame.landmarks[8].y) / 2 };
  expect(provider.getPointers()).toEqual([{ id: 'hand-0', source: 'hand', ...mapToScreen(midpoint), fist: false, pressed: false }]);
  expect(provider.getHandPose().joints[0]).toEqual({ x: -frame.worldLandmarks[0].x, y: -frame.worldLandmarks[0].y, z: frame.worldLandmarks[0].z });
  const pose = provider.getHandPose(); pose.pointer.x = 99;
  expect(provider.getHandPose().pointer.x).not.toBe(99);
  provider.stop(); expect(provider.getPointers()).toEqual([]);
});
it('follows demo movement, pinch and release', () => {
  const provider = new HandProvider(), source = createReplaySource(getReplayScript('demo'));
  let right = 0;
  for (let i = 0; i <= 300; i++) {
    const time = i * 1000 / 30; provider.ingest(source.frameAt(time), time);
    expect(provider.getPointers()).toHaveLength(1);
    if (i === 0) right = provider.getPointers()[0].x;
    if (i === 120) expect(provider.getPointers()[0].pressed).toBe(true);
  }
  expect(provider.getPointers()[0].x).toBeLessThan(right);
  expect(provider.getPointers()[0].pressed).toBe(false);
});
it('holds during short dropout, expires without ingest and fades on rendering time', () => {
  const provider = new HandProvider(), source = createReplaySource(getReplayScript('dropout'));
  for (let time = 0; time <= 900; time += 100) provider.ingest(source.frameAt(time), time);
  expect(provider.getHandPose().opacity).toBe(1);
  const previous = provider.getPointers();
  provider.ingest(source.frameAt(1100), 1100); expect(provider.getPointers()).toEqual(previous);
  provider.ingest(source.frameAt(1200), 1200); expect(provider.getPointers()[0].pressed).toBe(true);
  for (let time = 1300; time <= 1900; time += 100) provider.ingest(source.frameAt(time), time);
  provider.getHandPose(2200); expect(provider.getPointers()).toHaveLength(1);
  const fading = provider.getHandPose(2350);
  expect(fading.visible).toBe(false); expect(fading.opacity).toBeCloseTo(.5); expect(provider.getPointers()).toEqual([]);
  expect(provider.getHandPose(2500).opacity).toBe(0);
  provider.ingest(source.frameAt(2500), 2500);
  expect(provider.getHandPose(2650).opacity).toBeCloseTo(.5);
  expect(provider.getHandPose(2800).opacity).toBe(1);
});
it('keeps mapped stationary jitter range under 0.003 over two seconds', () => {
  const provider = new HandProvider(), source = createReplaySource(getReplayScript('jitter'));
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 120; i++) {
    const time = i * 1000 / 30; provider.ingest(source.frameAt(time), time);
    if (i >= 60) { xs.push(provider.getPointers()[0].x); ys.push(provider.getPointers()[0].y); }
  }
  for (const values of [xs, ys]) expect(Math.max(...values) - Math.min(...values)).toBeLessThan(.003);
});
