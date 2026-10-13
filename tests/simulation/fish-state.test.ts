import { expect, it } from 'vitest';
import { createSchool } from '../../src/simulation/fish-state';
import { createRandom } from '../../src/core/random';
import { FISH_PARAMS } from '../../src/config/params';
import { PALETTE } from '../../src/config/palette';

const bounds = { min: { x: -5, y: -3, z: -8 }, max: { x: 5, y: 3, z: 3 } };
it('creates a reproducible school with valid positions, appearance and velocities', () => {
  const school = createSchool(FISH_PARAMS.count, bounds, createRandom(42));
  expect(school).toEqual(createSchool(FISH_PARAMS.count, bounds, createRandom(42)));
  expect(school).toHaveLength(60);
  expect(new Set(school.map((fish) => fish.id)).size).toBe(60);
  expect(new Set(school.map((fish) => fish.variant)).size).toBe(PALETTE.fish.length);
  for (const fish of school) {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(fish.position[axis]).toBeGreaterThanOrEqual(bounds.min[axis]);
      expect(fish.position[axis]).toBeLessThanOrEqual(bounds.max[axis]);
    }
    expect(fish.velocity.length()).toBeGreaterThanOrEqual(FISH_PARAMS.minSpeed);
    expect(fish.velocity.length()).toBeLessThanOrEqual(FISH_PARAMS.maxSpeed);
    expect(fish.forward.length()).toBeCloseTo(1);
    expect(fish.forward.distanceTo(fish.velocity.clone().normalize())).toBeLessThan(1e-12);
    expect(fish.scale).toBeGreaterThanOrEqual(FISH_PARAMS.minScale);
    expect(fish.scale).toBeLessThanOrEqual(FISH_PARAMS.maxScale);
    expect(fish.phase).toBeGreaterThanOrEqual(0);
    expect(fish.phase).toBeLessThan(Math.PI * 2);
    expect(fish.variant).toBeGreaterThanOrEqual(0);
    expect(fish.variant).toBeLessThan(PALETTE.fish.length);
  }
});
it('supports empty and small schools', () => {
  expect(createSchool(0, bounds, createRandom(1))).toEqual([]);
  expect(createSchool(1, bounds, createRandom(1))).toHaveLength(1);
});
