import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { GrabController } from '../../src/simulation/grab';
import { createSchool } from '../../src/simulation/fish-state';
import { stepSchool } from '../../src/simulation/boids';
import { createRandom } from '../../src/core/random';
import { FISH_PARAMS, GRAB_PARAMS } from '../../src/config/params';
import type { Pointer } from '../../src/input/types';
const bounds = { min: { x: -5, y: -4, z: -8 }, max: { x: 5, y: 4, z: 1.5 } };
const ctx = { bounds, aspect: 1, projectToScreen: (p: Vector3) => ({ x: .5 + p.x / 10, y: .5 - p.y / 10 }), screenToWorld: (x: number, y: number, z: number) => new Vector3((x - .5) * 10, (.5 - y) * 10, z) };
const pointer: Pointer = { id: 'mouse', x: .5, y: .5, pressed: true, source: 'mouse' };
function school(count = 2) { const fish = createSchool(count, bounds, createRandom(42)); fish.forEach((f, i) => f.position.set(.3 + i * .3, 0, 0)); return fish; }
it('initializes normal fish and selects the closest candidate', () => {
  const fish = school(); expect(fish.every((f) => f.mode === 'swimming' && f.panic === 0 && f.fleeTime === 0)).toBe(true);
  new GrabController().update({ pointers: [pointer] }, fish, 0, ctx);
  expect(fish.map((f) => f.mode)).toEqual(['grabbed', 'swimming']);
});
it('does not grab in empty space or by dragging an already pressed pointer', () => {
  const fish = school(), grab = new GrabController();
  grab.update({ pointers: [{ ...pointer, x: 0 }] }, fish, 0, ctx);
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  expect(fish.every((f) => f.mode === 'swimming')).toBe(true);
  grab.update({ pointers: [{ ...pointer, pressed: false }] }, fish, 0, ctx);
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  expect(fish[0].mode).toBe('grabbed');
});
it('uses width-normalized distance and excludes the exact radius boundary', () => {
  const fish = school(1); fish[0].position.set(0, 0.6, 0);
  new GrabController().update({ pointers: [pointer] }, fish, 0, ctx);
  expect(fish[0].mode).toBe('grabbed');
  fish[0].mode = 'swimming';
  new GrabController().update({ pointers: [{ ...pointer, x: 0, y: 0 }] }, fish, 0, { ...ctx, projectToScreen: () => ({ x: GRAB_PARAMS.grabRadius, y: 0 }) });
  expect(fish[0].mode).toBe('swimming');
});
it.each(['mouse', 'touch', 'hand'] as const)('supports %s and only one grabbed fish for two pointers', (source) => {
  const fish = school(), grab = new GrabController();
  grab.update({ pointers: [{ ...pointer, source }, { ...pointer, id: 'second', x: .56 }] }, fish, 0, ctx);
  expect(fish.filter((f) => f.mode === 'grabbed')).toHaveLength(1);
  grab.update({ pointers: [{ ...pointer, source, pressed: false }, { ...pointer, id: 'second', x: .56 }] }, fish, 0, ctx);
  expect(fish.filter((f) => f.mode === 'grabbed')).toHaveLength(0);
});
it('follows with separate xy/z time constants, raises panic and clamps bounds', () => {
  const fish = school(1), grab = new GrabController(); const start = fish[0].position.clone();
  grab.update({ pointers: [pointer] }, fish, .1, ctx);
  expect(fish[0].position.x).toBeCloseTo(start.x * Math.exp(-1));
  expect(fish[0].position.z).toBeCloseTo(GRAB_PARAMS.holdZ * (1 - Math.exp(-.5)));
  expect(fish[0].panic).toBe(1);
  for (let i = 0; i < 120; i++) grab.update({ pointers: [{ ...pointer, x: 2, y: -2 }] }, fish, 1 / 60, ctx);
  expect(fish[0].position.x).toBe(bounds.max.x); expect(fish[0].position.y).toBe(bounds.max.y);
  expect(fish[0].position.z).toBeCloseTo(GRAB_PARAMS.holdZ, 3);
});
it.each([false, true])('releases away from last/current pointer when missing=%s', (missing) => {
  const fish = school(1), grab = new GrabController();
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  grab.update({ pointers: missing ? [] : [{ ...pointer, pressed: false }] }, fish, 0, ctx);
  expect(fish[0].mode).toBe('fleeing'); expect(fish[0].fleeTime).toBe(0);
  expect(fish[0].velocity.x).toBeGreaterThan(0); expect(fish[0].velocity.z).toBe(0);
  expect(fish[0].velocity.length()).toBeCloseTo(FISH_PARAMS.maxSpeed * GRAB_PARAMS.fleeSpeedMultiplier);
  expect(fish[0].forward).toEqual(fish[0].velocity.clone().normalize());
});
it('uses deterministic overlap fallback and can re-grab a fleeing fish', () => {
  const fish = school(1), grab = new GrabController(); fish[0].position.set(0, 0, GRAB_PARAMS.holdZ); fish[0].forward.set(0, 0, 1);
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  grab.update({ pointers: [] }, fish, 0, ctx);
  expect(fish[0].forward).toEqual(new Vector3(1, 0, 0));
  grab.update({ pointers: [pointer] }, fish, 0, ctx); expect(fish[0].mode).toBe('grabbed');
});
it('keeps grabbed state untouched by boids while neighbors separate', () => {
  const fish = school(), grab = new GrabController(); fish[0].position.set(0,0,GRAB_PARAMS.holdZ); fish[1].position.set(.1,0,bounds.max.z);
  fish[1].velocity.set(0,0,.6); fish[1].forward.set(0,0,1);
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  const position = fish[0].position.clone(), velocity = fish[0].velocity.clone(), forward = fish[0].forward.clone();
  for (let i = 0; i < 120; i++) {
    grab.update({ pointers: [pointer] }, fish, 1 / 60, ctx);
    stepSchool(fish, 1 / 60, { ...ctx, time: i / 60, pointers: [] });
  }
  expect(fish[0].position).toEqual(position); expect(fish[0].velocity).toEqual(velocity); expect(fish[0].forward).toEqual(forward);
  expect(fish[1].position.distanceTo(position)).toBeGreaterThanOrEqual(FISH_PARAMS.separationRadius);
});
it('decays fleeing cap/panic and returns to normal within two seconds', () => {
  const fish = school(1), grab = new GrabController();
  grab.update({ pointers: [pointer] }, fish, .1, ctx); grab.update({ pointers: [] }, fish, 0, ctx);
  for (let i = 0; i < 120; i++) {
    const previous = fish[0].forward.clone();
    stepSchool(fish, 1 / 60, { ...ctx, time: i / 60, pointers: [] });
    const remaining = Math.max(0, 1 - (i + 1) / 120);
    expect(fish[0].velocity.length()).toBeLessThanOrEqual(FISH_PARAMS.maxSpeed * (1 + remaining) + 1e-10);
    expect(fish[0].panic).toBeCloseTo(remaining);
    expect(previous.angleTo(fish[0].forward)).toBeLessThanOrEqual(FISH_PARAMS.maxTurnAngle + 1e-8);
  }
  expect(fish[0].mode).toBe('swimming'); expect(fish[0].panic).toBe(0);
  expect(fish[0].velocity.length()).toBeGreaterThanOrEqual(FISH_PARAMS.minSpeed - 1e-10);
});


it.each([0.07, 0.09])('checks vertical distance %s in width units at 16:9', (distance) => {
  const fish = school(1), aspect = 16 / 9;
  new GrabController().update({ pointers: [pointer] }, fish, 0, {
    ...ctx, aspect,
    projectToScreen: () => ({ x: pointer.x, y: pointer.y + distance * aspect }),
  });
  expect(fish[0].mode).toBe(distance < GRAB_PARAMS.grabRadius ? 'grabbed' : 'swimming');
});

it.each([-1, 1])('caps upward escape pitch while preserving current horizontal heading %s', (heading) => {
  const fish = school(1), grab = new GrabController();
  fish[0].position.set(0, 0, GRAB_PARAMS.holdZ); fish[0].forward.set(heading, 0, 0);
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  grab.update({ pointers: [{ ...pointer, y: .6, pressed: false }] }, fish, 0, ctx);
  const velocity = fish[0].velocity;
  expect(velocity.y).toBeGreaterThan(0);
  expect(Math.sign(velocity.x)).toBe(heading);
  expect(Math.abs(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)))).toBeLessThanOrEqual(FISH_PARAMS.maxPitch + 1e-12);
  expect(velocity.length()).toBeCloseTo(FISH_PARAMS.maxSpeed * GRAB_PARAMS.fleeSpeedMultiplier);
  expect(fish[0].forward.distanceTo(velocity.clone().normalize())).toBeLessThan(1e-12);
});

it.each([-1, 1])('preserves existing escape x sign %s when limiting pitch', (sign) => {
  const fish = school(1), grab = new GrabController();
  fish[0].position.set(sign * .01, 0, GRAB_PARAMS.holdZ); fish[0].forward.set(-sign, 0, 0);
  grab.update({ pointers: [pointer] }, fish, 0, ctx);
  grab.update({ pointers: [{ ...pointer, y: .6, pressed: false }] }, fish, 0, ctx);
  expect(Math.sign(fish[0].velocity.x)).toBe(sign);
});
