import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { computeAvoidanceForce } from '../../src/simulation/cursor-avoidance';
import { createSchool } from '../../src/simulation/fish-state';
import { createRandom } from '../../src/core/random';
import type { Pointer } from '../../src/input/types';

const project = (p: Vector3) => ({ x: 0.5 + p.x / 10, y: 0.5 - p.y / 10 });
const pointer: Pointer = { id: 'mouse', x: 0.5, y: 0.5, fist: false, pressed: false, source: 'mouse' };
const makeFish = () => createSchool(1, { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }, createRandom(42))[0];
it('pushes away in world xy, correctly flipping screen y and growing closer to cursor', () => {
  const fish = makeFish();
  fish.position.set(0.2, 0.2, -1);
  const near = computeAvoidanceForce(fish, [pointer], project);
  expect(near.x).toBeGreaterThan(0);
  expect(near.y).toBeGreaterThan(0);
  expect(near.z).toBe(0);
  fish.position.set(0.6, 0.6, -1);
  expect(near.length()).toBeGreaterThan(computeAvoidanceForce(fish, [pointer], project).length());
  fish.position.set(-0.2, -0.2, 1);
  const opposite = computeAvoidanceForce(fish, [pointer], project);
  expect(opposite.x).toBeLessThan(0);
  expect(opposite.y).toBeLessThan(0);
});
it('returns zero outside radius or without pointers', () => {
  const fish = makeFish();
  fish.position.set(3, 0, 0);
  expect(computeAvoidanceForce(fish, [pointer], project)).toEqual(new Vector3());
  fish.position.set(0.1, 0, 0);
  expect(computeAvoidanceForce(fish, [], project)).toEqual(new Vector3());
});
it('handles exact overlap deterministically and sums multiple pointers', () => {
  const fish = makeFish();
  fish.position.set(0, 0, 0);
  const force = computeAvoidanceForce(fish, [pointer], project);
  expect(force.length()).toBeCloseTo(1);
  expect(force.z).toBe(0);
  expect(computeAvoidanceForce(fish, [pointer, { ...pointer, id: 'touch-2' }], project)).toEqual(force.clone().multiplyScalar(2));
});

it('ignores fist pointers and restores avoidance when released',()=>{
 const fish=makeFish();fish.position.set(.1,0,0);
 expect(computeAvoidanceForce(fish,[{...pointer,fist:true}],project)).toEqual(new Vector3());
 expect(computeAvoidanceForce(fish,[{...pointer,fist:true},pointer],project)).toEqual(computeAvoidanceForce(fish,[pointer],project));
 expect(computeAvoidanceForce(fish,[pointer],project).length()).toBeGreaterThan(0);
});
