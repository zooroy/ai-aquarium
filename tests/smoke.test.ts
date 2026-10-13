import { expect, test } from 'vitest';
import { FISH_PARAMS } from '../src/config/params';
import { PALETTE } from '../src/config/palette';

test('loads aquarium configuration in the node environment', () => {
  expect(typeof window).toBe('undefined');
  expect(FISH_PARAMS.count).toBe(60);
  expect(FISH_PARAMS.minSpeed).toBeGreaterThan(0);
  expect(FISH_PARAMS.maxSpeed).toBeGreaterThan(FISH_PARAMS.minSpeed);
  expect(FISH_PARAMS.maxTurnAngle).toBeCloseTo(Math.PI / 6);
  expect(PALETTE.fish.length).toBeGreaterThanOrEqual(3);
  expect(PALETTE.fog).toBe(PALETTE.water);
});
