import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { SpatialGrid } from '../../src/simulation/spatial-grid';
import { createSchool } from '../../src/simulation/fish-state';
import { createRandom } from '../../src/core/random';
import { FISH_PARAMS } from '../../src/config/params';

it('matches brute force for 200 seeded points across negative and positive cells', () => {
  const random = createRandom(42);
  const fish = createSchool(200, { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } }, random);
  const grid = new SpatialGrid();
  expect(grid.cellSize).toBe(FISH_PARAMS.perceptionRadius);
  grid.rebuild(fish);
  for (const item of fish) {
    for (const radius of [0, 0.5, FISH_PARAMS.perceptionRadius, 5]) {
      const expected = fish.filter((other) => other.position.distanceToSquared(item.position) <= radius * radius).map((f) => f.id).sort((a, b) => a - b);
      expect(grid.queryNeighbors(item.position, radius).map((f) => f.id).sort((a, b) => a - b)).toEqual(expected);
    }
  }
  grid.rebuild([]);
  expect(grid.queryNeighbors(new Vector3(), 100)).toEqual([]);
});

it('includes exact radius boundaries and rebuilds after movement', () => {
  const fish = createSchool(2, { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, createRandom(1));
  fish[0].position.set(0, 0, 0);
  fish[1].position.set(-2.5, 0, 0);
  const grid = new SpatialGrid();
  grid.rebuild(fish);
  expect(grid.queryNeighbors(new Vector3(), 2.5)).toHaveLength(2);
  fish[1].position.set(10, 0, 0);
  grid.rebuild(fish);
  expect(grid.queryNeighbors(new Vector3(), 2.5)).toEqual([fish[0]]);
});
