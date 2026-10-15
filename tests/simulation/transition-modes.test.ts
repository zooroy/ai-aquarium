import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { TANK_PARAMS } from '../../src/config/params';
import { createRandom } from '../../src/core/random';
import { visibleHalfWidth, visibleTopY } from '../../src/core/tank-bounds';
import { stepSchool } from '../../src/simulation/boids';
import { createSchool } from '../../src/simulation/fish-state';
import { GrabController } from '../../src/simulation/grab';
import type { Pointer } from '../../src/input/types';

const bounds = { min: { x: -5, y: -4, z: -8 }, max: { x: 5, y: 4, z: 1.5 } };
const projectToScreen = (p: Vector3) => ({ x: 0.5 + p.x / 10, y: 0.5 - p.y / 10 });
const grabCtx = { bounds, aspect: 1, projectToScreen, screenToWorld: (x: number, y: number, z: number) => new Vector3((x - 0.5) * 10, (0.5 - y) * 10, z) };
const pointer: Pointer = { id: 'mouse', x: 0.5, y: 0.5, fist: false, pressed: true, source: 'mouse' };

it.each(['dropping', 'leaving'] as const)('stepSchool leaves %s fish alone and ignores them as neighbours', (mode) => {
  const fish = createSchool(2, bounds, createRandom(1));
  fish[0].position.set(0, 0, 0); fish[1].position.set(0.05, 0, 0);
  fish[0].velocity.set(0, 0, 1); fish[1].velocity.set(0, 0, 1);
  fish[1].mode = mode;
  const alone = createSchool(1, bounds, createRandom(1));
  alone[0].position.copy(fish[0].position); alone[0].velocity.copy(fish[0].velocity); alone[0].forward.copy(fish[0].forward);
  const frozen = fish[1].position.clone();
  for (let i = 0; i < 10; i++) {
    stepSchool(fish, 1 / 60, { screenToWorld: grabCtx.screenToWorld, bounds, time: i / 60, pointers: [], projectToScreen });
    stepSchool(alone, 1 / 60, { screenToWorld: grabCtx.screenToWorld, bounds, time: i / 60, pointers: [], projectToScreen });
  }
  expect(fish[1].position).toEqual(frozen);
  expect(fish[0].position.distanceTo(alone[0].position)).toBeLessThan(1e-9);
});

it.each(['dropping', 'leaving'] as const)('GrabController never picks %s fish', (mode) => {
  const fish = createSchool(1, bounds, createRandom(2));
  fish[0].position.set(0, 0, 0); fish[0].scale = 1; fish[0].mode = mode;
  new GrabController().update({ pointers: [pointer] }, fish, 0, grabCtx);
  expect(fish[0].mode).toBe(mode);
});

it('lets go of a held fish once it starts leaving', () => {
  const fish = createSchool(1, bounds, createRandom(3));
  fish[0].position.set(0, 0, 0); fish[0].scale = 1;
  const grab = new GrabController();
  grab.update({ pointers: [pointer] }, fish, 0, grabCtx);
  expect(fish[0].mode).toBe('grabbed');
  fish[0].mode = 'leaving';
  expect(() => grab.update({ pointers: [pointer] }, fish, 1 / 60, grabCtx)).not.toThrow();
  expect(fish[0].mode).toBe('leaving');
  grab.update({ pointers: [{ ...pointer, fist: false, pressed: false }] }, fish, 1 / 60, grabCtx);
  expect(fish[0].mode).toBe('leaving');
});

it('computes the visible screen edges at a depth', () => {
  const { cameraFov, cameraPosition } = TANK_PARAMS;
  expect(visibleTopY(cameraFov, 0, cameraPosition.z, 0)).toBeCloseTo(Math.tan(Math.PI / 8) * 14);
  expect(visibleTopY(cameraFov, 1, 14, 4)).toBeCloseTo(1 + Math.tan(Math.PI / 8) * 10);
  expect(visibleHalfWidth(cameraFov, 14, 2, 0)).toBeCloseTo(Math.tan(Math.PI / 8) * 28);
});
