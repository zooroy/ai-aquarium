import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { stepSchool } from '../../src/simulation/boids';
import { createSchool } from '../../src/simulation/fish-state';
import type { Fish } from '../../src/simulation/fish-state';
import { createRandom } from '../../src/core/random';
import { computeTankBounds } from '../../src/core/tank-bounds';
import { CURSOR_PARAMS, FISH_PARAMS, TANK_PARAMS } from '../../src/config/params';
import type { Pointer } from '../../src/input/types';

const bounds = computeTankBounds({ fovDeg: TANK_PARAMS.cameraFov, cameraZ: TANK_PARAMS.cameraPosition.z, aspect: 16 / 9 });
const projectToScreen = (p: Vector3) => ({ x: 0.5 + p.x / 10, y: 0.5 - p.y / 10 });
const context = { bounds, time: 0, pointers: [] as readonly Pointer[], projectToScreen };
const coherence = (fish: Fish[]) => fish.reduce((sum, f) => sum.add(f.velocity.clone().normalize()), new Vector3()).length() / fish.length;

describe('stepSchool', () => {
  it('separates two nearby fish within a few steps', () => {
    const fish = createSchool(2, bounds, createRandom(42));
    fish[0].position.set(-0.1, 0, 0);
    fish[1].position.set(0.1, 0, 0);
    for (const f of fish) { f.velocity.set(0, 0, 1); f.forward.set(0, 0, 1); }
    const before = fish[0].position.distanceTo(fish[1].position);
    for (let i = 0; i < 10; i++) stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
    expect(fish[0].position.distanceTo(fish[1].position)).toBeGreaterThan(before);
  });

  it('increases direction coherence after 5 seconds for nearby random headings', () => {
    const random = createRandom(42);
    const fish = createSchool(30, { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }, random);
    const before = coherence(fish);
    for (let i = 0; i < 300; i++) stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
    expect(coherence(fish)).toBeGreaterThan(before);
  });

  it('keeps 60 fish bounded, speed-limited and smoothly oriented for 2000 steps', () => {
    const fish = createSchool(60, bounds, createRandom(42));
    let minSpeed = Infinity;
    let maxSpeed = 0;
    let maxTurn = 0;
    let maxUnitError = 0;
    let escaped = false;
    for (let i = 0; i < 2000; i++) {
      const previous = fish.map((f) => f.forward.clone());
      stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
      fish.forEach((f, index) => {
        minSpeed = Math.min(minSpeed, f.velocity.length());
        maxSpeed = Math.max(maxSpeed, f.velocity.length());
        maxTurn = Math.max(maxTurn, previous[index].angleTo(f.forward));
        maxUnitError = Math.max(maxUnitError, Math.abs(f.forward.length() - 1));
        for (const axis of ['x', 'y', 'z'] as const) {
          if (!Number.isFinite(f.position[axis]) || f.position[axis] < bounds.min[axis] || f.position[axis] > bounds.max[axis]) escaped = true;
        }
      });
    }
    expect(escaped).toBe(false);
    expect(minSpeed).toBeGreaterThanOrEqual(FISH_PARAMS.minSpeed - 1e-12);
    expect(maxSpeed).toBeLessThanOrEqual(FISH_PARAMS.maxSpeed + 1e-12);
    expect(maxTurn).toBeLessThanOrEqual(FISH_PARAMS.maxTurnAngle + 1e-12);
    expect(maxUnitError).toBeLessThan(1e-12);
  });

  it('limits a full reversal to 30 degrees and rotates toward velocity', () => {
    const fish = createSchool(1, bounds, createRandom(42));
    fish[0].position.set(0, 0, 0);
    fish[0].velocity.set(-1, 0, 0);
    fish[0].forward.set(1, 0, 0);
    const before = fish[0].forward.clone();
    stepSchool(fish, 0.2, context);
    expect(before.angleTo(fish[0].forward)).toBeLessThanOrEqual(FISH_PARAMS.maxTurnAngle + 1e-12);
    expect(fish[0].forward.angleTo(fish[0].velocity)).toBeLessThan(before.angleTo(fish[0].velocity));
  });

  it('reduces the number of fish near a stationary cursor after one second', () => {
    const fish = createSchool(40, { min: { x: -0.9, y: -0.9, z: -1 }, max: { x: 0.9, y: 0.9, z: 1 } }, createRandom(42));
    const control = createSchool(40, { min: { x: -0.9, y: -0.9, z: -1 }, max: { x: 0.9, y: 0.9, z: 1 } }, createRandom(42));
    const pointers: Pointer[] = [{ id: 'mouse', x: 0.5, y: 0.5, pressed: false, source: 'mouse' }];
    const nearCount = (school: Fish[]) => school.filter((f) => {
      const p = projectToScreen(f.position);
      return Math.hypot(p.x - 0.5, p.y - 0.5) < CURSOR_PARAMS.avoidanceRadius;
    }).length;
    const before = nearCount(fish);
    for (let i = 0; i < 60; i++) {
      stepSchool(fish, 1 / 60, { ...context, pointers, time: i / 60 });
      stepSchool(control, 1 / 60, { ...context, time: i / 60 });
    }
    expect(nearCount(fish)).toBeLessThan(before);
    expect(nearCount(fish)).toBeLessThan(nearCount(control));
  });

  it('is reproducible and zero dt leaves the state unchanged', () => {
    const first = createSchool(5, bounds, createRandom(42));
    const second = createSchool(5, bounds, createRandom(42));
    stepSchool(first, 0, context);
    expect(first).toEqual(second);
    for (let i = 0; i < 10; i++) {
      stepSchool(first, 1 / 60, { ...context, time: i / 60 });
      stepSchool(second, 1 / 60, { ...context, time: i / 60 });
    }
    expect(first).toEqual(second);
  });
});

it('applies stronger inward boundary steering nearer the wall', () => {
  const near = createSchool(1, bounds, createRandom(42));
  const far = createSchool(1, bounds, createRandom(42));
  near[0].position.set(bounds.max.x - 0.2, 0, 0);
  far[0].position.set(bounds.max.x - 1.2, 0, 0);
  for (const school of [near, far]) {
    school[0].velocity.set(0, 0, 1);
    school[0].forward.set(0, 0, 1);
    stepSchool(school, 1 / 60, context);
  }
  expect(near[0].velocity.x).toBeLessThan(far[0].velocity.x);
  expect(far[0].velocity.x).toBeLessThan(0);
  expect(near[0].position.x).toBeLessThan(bounds.max.x - 0.2);
});

it('turns away from a wall before needing the position clamp', () => {
  const fish = createSchool(1, bounds, createRandom(42));
  fish[0].position.set(bounds.max.x - FISH_PARAMS.boundaryAvoidanceRadius, 0, 0);
  fish[0].velocity.set(1, 0, 0);
  fish[0].forward.set(1, 0, 0);
  let greatestX = fish[0].position.x;
  for (let i = 0; i < 180; i++) {
    stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
    greatestX = Math.max(greatestX, fish[0].position.x);
  }
  expect(greatestX).toBeLessThan(bounds.max.x);
  expect(fish[0].velocity.x).toBeLessThan(0);
});

it('caps summed acceleration before applying speed limits', () => {
  const fish = createSchool(1, bounds, createRandom(42));
  fish[0].position.set(0.1, 0, 0);
  fish[0].velocity.set(0, 0, 1);
  fish[0].forward.set(0, 0, 1);
  const before = fish[0].velocity.clone();
  stepSchool(fish, 1 / 60, {
    ...context,
    pointers: [{ id: 'mouse', x: 0.5, y: 0.5, pressed: false, source: 'mouse' }],
  });
  expect(before.distanceTo(fish[0].velocity)).toBeCloseTo(FISH_PARAMS.maxSteeringForce / 60, 12);
});

it('draws separated neighbors together through cohesion', () => {
  const fish = createSchool(2, bounds, createRandom(42));
  fish[0].position.set(-1, 0, 0);
  fish[1].position.set(1, 0, 0);
  for (const item of fish) {
    item.velocity.set(0, 0, 1);
    item.forward.set(0, 0, 1);
  }
  for (let i = 0; i < 30; i++) stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
  expect(fish[0].position.distanceTo(fish[1].position)).toBeLessThan(2);
});

it('keeps seed 42 loose, horizontal and split into small groups after ten seconds', () => {
  const fish = createSchool(60, bounds, createRandom(42));
  for (let i = 0; i < 600; i++) stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
  const meanNearest = fish.reduce((sum, f) => sum + Math.min(...fish.filter((other) => other !== f).map((other) => f.position.distanceTo(other.position))), 0) / fish.length;
  const remaining = new Set(fish);
  const groups: number[] = [];
  while (remaining.size) {
    const queue = [remaining.values().next().value!]; remaining.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) for (const other of remaining) {
      if (queue[i].position.distanceTo(other.position) <= FISH_PARAMS.perceptionRadius) { remaining.delete(other); queue.push(other); }
    }
    groups.push(queue.length);
  }

  expect(meanNearest).toBeGreaterThanOrEqual(0.9);
  expect(groups.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...groups)).toBeLessThanOrEqual(fish.length * 0.6);
  for (const f of fish) for (const direction of [f.velocity, f.forward]) {
    expect(Math.abs(Math.atan2(direction.y, Math.hypot(direction.x, direction.z)))).toBeLessThanOrEqual(FISH_PARAMS.maxPitch + 1e-8);
  }
});


it('limits velocity immediately and recovers old vertical forward without a sudden flip', () => {
  const fish = createSchool(1, bounds, createRandom(42));
  fish[0].position.set(0, 0, 0);
  fish[0].velocity.set(0, 1, 0);
  fish[0].forward.set(0, 1, 0);
  for (let i = 0; i < 60; i++) {
    const previous = fish[0].forward.clone();
    stepSchool(fish, 1 / 60, { ...context, time: i / 60 });
    expect(previous.angleTo(fish[0].forward)).toBeLessThanOrEqual(FISH_PARAMS.maxTurnAngle + 1e-8);
    expect(Math.abs(Math.asin(fish[0].velocity.y / fish[0].velocity.length()))).toBeLessThanOrEqual(FISH_PARAMS.maxPitch + 1e-8);
    if (i >= 2) expect(Math.abs(Math.asin(fish[0].forward.y))).toBeLessThanOrEqual(FISH_PARAMS.maxPitch + 1e-8);
  }
});
