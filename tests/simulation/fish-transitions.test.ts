import { describe, expect, it } from 'vitest';
import { CUSTOM_FISH_PARAMS as p, FISH_PARAMS } from '../../src/config/params';
import { createRandom } from '../../src/core/random';
import { canAddCustomFish, spawnCustomFish } from '../../src/simulation/custom-fish';
import { chooseFishToRetire, spawnDroppingFish, startLeaving, stepDropping, stepLeaving, stepTransitions } from '../../src/simulation/fish-transitions';
import type { Fish } from '../../src/simulation/fish-state';

const bounds = { min: { x: -6, y: -3, z: -8 }, max: { x: 6, y: 4, z: 1.5 } };
const visibleTop = (z: number) => 5 + (1.5 - z) * 0.2;
const ctx = { visibleHalfWidth: () => 8 };
const custom = (id: string, x = 0): Fish => {
  const fish = spawnCustomFish({ id }, bounds, createRandom(id.length), id.charCodeAt(0));
  fish.position.x = x;
  return fish;
};

describe('dropping', () => {
  it('starts above the screen, inside the central strip, and lands in the upper third', () => {
    for (let seed = 0; seed < 50; seed++) {
      const fish = spawnDroppingFish({ id: 'a' }, bounds, createRandom(seed), 7, visibleTop);
      expect(fish.mode).toBe('dropping');
      expect(fish.position.y).toBeCloseTo(visibleTop(fish.position.z) + p.dropStartMargin);
      expect(Math.abs(fish.position.x)).toBeLessThanOrEqual(6 * p.dropSpreadX);
      expect(fish.position.z).toBeGreaterThanOrEqual((bounds.min.z + bounds.max.z) / 2);
      expect(fish.position.z).toBeLessThanOrEqual(bounds.max.z - p.dropFrontInset);
      expect(fish.forward.y).toBeLessThan(-0.5);
      expect(fish.transition?.targetY).toBeCloseTo(4 - 7 / 3);
    }
  });

  it('falls monotonically and becomes a swimming fish within dropDuration', () => {
    const fish = spawnDroppingFish({ id: 'a' }, bounds, createRandom(4), 7, visibleTop);
    const direction = fish.transition!.direction.clone();
    const targetY = fish.transition!.targetY;
    let y = fish.position.y;
    const steps = Math.ceil(p.dropDuration * 60);
    for (let i = 0; i < steps; i++) {
      stepDropping(fish, 1 / 60);
      expect(fish.position.y).toBeLessThanOrEqual(y + 1e-12);
      y = fish.position.y;
    }
    expect(fish.mode).toBe('swimming');
    expect(fish.transition).toBeUndefined();
    expect(fish.position.y).toBeCloseTo(targetY);
    expect(fish.velocity.length()).toBeCloseTo(FISH_PARAMS.maxSpeed);
    expect(fish.velocity.y).toBe(0);
    expect(fish.velocity.clone().normalize().dot(direction)).toBeCloseTo(1);
    expect(Math.abs(fish.forward.y)).toBeLessThan(1e-9);
  });
});

describe('leaving', () => {
  it('heads for the nearest side and finishes past the visible edge', () => {
    for (const [x, side] of [[-2, -1], [3, 1], [0, 1]] as const) {
      const fish = custom('a', x);
      startLeaving(fish);
      expect(fish.mode).toBe('leaving');
      expect(fish.transition?.direction.x).toBe(side);
      let done = false, frames = 0;
      while (!done && frames < 1000) { done = stepLeaving(fish, 1 / 60, ctx); frames++; }
      expect(done).toBe(true);
      expect(Math.abs(fish.position.x)).toBeGreaterThan(8 + p.leaveMargin);
      expect(fish.forward.x * side).toBeGreaterThan(0.9);
    }
  });

  it('finishes after the safety timeout even if it never leaves the screen', () => {
    const fish = custom('a');
    startLeaving(fish);
    expect(stepLeaving(fish, p.leaveTimeout - 0.01, { visibleHalfWidth: () => 1e9 })).toBe(false);
    expect(stepLeaving(fish, 0.02, { visibleHalfWidth: () => 1e9 })).toBe(true);
  });

  it('stepTransitions returns only fish that finished leaving', () => {
    const dropping = spawnDroppingFish({ id: 'd' }, bounds, createRandom(1), 1, visibleTop);
    const leaving = custom('l', 7.9);
    const swimming = custom('s');
    startLeaving(leaving);
    const y = dropping.position.y, swimPos = swimming.position.clone();
    expect(stepTransitions([dropping, leaving, swimming], 1, ctx)).toEqual(['l']);
    expect(dropping.position.y).toBeLessThan(y);
    expect(swimming.position).toEqual(swimPos);
  });
});

describe('retiring', () => {
  it('picks the oldest fish still present and not already leaving', () => {
    const a = custom('a'), b = custom('b'), c = custom('c');
    startLeaving(a);
    expect(chooseFishToRetire(['gone', 'a', 'b', 'c'], [c, b, a])).toBe('b');
    expect(chooseFishToRetire(['a'], [a])).toBeUndefined();
  });

  it('does not count leaving fish toward the limit', () => {
    const fish = Array.from({ length: p.maxCount }, (_, i) => custom(`f${i}`));
    expect(canAddCustomFish(fish)).toBe(false);
    startLeaving(fish[0]);
    expect(canAddCustomFish(fish)).toBe(true);
  });
});
