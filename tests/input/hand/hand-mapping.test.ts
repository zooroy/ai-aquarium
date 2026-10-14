import { expect, it } from 'vitest';
import { mapToScreen } from '../../../src/input/hand/hand-mapping';
it('mirrors and maps active area edges, clamping outside', () => {
  expect(mapToScreen({ x: .3, y: .5 }).x).toBeGreaterThan(mapToScreen({ x: .7, y: .5 }).x);
  expect(mapToScreen({ x: .85, y: .15 }).x).toBeCloseTo(0);
  expect(mapToScreen({ x: .15, y: .85 }).x).toBeCloseTo(1);
  expect(mapToScreen({ x: .5, y: .15 }).y).toBeCloseTo(0);
  expect(mapToScreen({ x: .5, y: .85 }).y).toBeCloseTo(1);
  expect(mapToScreen({ x: -1, y: 2 })).toEqual({ x: 1, y: 1 });
});
