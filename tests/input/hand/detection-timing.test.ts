import { expect, it } from 'vitest';
import { shouldDetectFrame, updateDetectionWindow } from '../../../src/input/hand/detection-timing';

it('accepts every jittered 30fps frame', () => {
  let now = 0, last = -Infinity;
  expect(shouldDetectFrame(now, last)).toBe(true); last = now;
  for (let i = 0; i < 300; i++) {
    now += [33.0, 33.4, 32.9][i % 3];
    expect(shouldDetectFrame(now, last)).toBe(true); last = now;
  }
  expect(300 / (now / 1000)).toBeCloseTo(30.21, 1);
});
it('accepts approximately 30 detections per second from a 60fps source', () => {
  let last = 0, count = 0;
  for (let i = 1; i <= 600; i++) {
    const now = i * 1000 / 60;
    if (shouldDetectFrame(now, last)) { count++; last = now; }
  }
  expect(count).toBe(300);
  expect(shouldDetectFrame(last, last)).toBe(false);
});
it('drops warmup samples and computes recent duration and frequency without mutating input', () => {
  const warmup = [{ timestamp: 100, durationMs: 500 }];
  let samples = warmup;
  for (let i = 0; i < 30; i++) {
    const timestamp = 1200 + i * 1000 / 30;
    samples = updateDetectionWindow(samples, timestamp, { timestamp, durationMs: 8 }).samples;
  }
  const stats = updateDetectionWindow(samples, 2199);
  expect(stats.hz).toBe(30);
  expect(stats.averageMs).toBe(8);
  expect(warmup).toEqual([{ timestamp: 100, durationMs: 500 }]);
  expect(updateDetectionWindow(samples, 4000)).toEqual({ samples: [], hz: 0, averageMs: 0 });
});
it('uses an open lower boundary, includes now and averages only retained samples', () => {
  const stats = updateDetectionWindow([
    { timestamp: 1000, durationMs: 100 },
    { timestamp: 1500, durationMs: 4 },
    { timestamp: 2001, durationMs: 999 },
  ], 2000, { timestamp: 2000, durationMs: 8 });
  expect(stats.hz).toBe(2);
  expect(stats.averageMs).toBe(6);
  expect(stats.samples.map((sample) => sample.timestamp)).toEqual([1500, 2000]);
});
